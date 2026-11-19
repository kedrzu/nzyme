/**
 * Checks that every public package can be published by the release workflow through npm trusted
 * publishing (OIDC), and fixes what is missing, asking before each step:
 *
 * 1. a package that is not on npm yet is built, packed and published from this checkout, because
 *    npm accepts a trusted publisher only for a package that already exists;
 * 2. a package without a trusted publisher for `.github/workflows/release.yml` gets one.
 *
 * Run it locally after `npm login`; the npm account needs two-factor authentication, and npm asks for
 * it on every write. Bootstrap a new package from the release commit (`origin/release`), so that its
 * first version matches what the release workflow publishes for the others.
 *
 * Usage: `bun trust`
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

import { $ } from 'bun';

import { assertNoPrivateDependencies, assertNoWorkspaceProtocol, pack, readWorkspacePackages } from './publish.js';
import type { WorkspacePackage } from './publish.js';

const REPOSITORY = 'kedrzu/nzyme';
const WORKFLOW = 'release.yml';
const ROOT = path.resolve(import.meta.dir, '..');

/** Where a package stands with npm trusted publishing. */
type TrustState = 'trusted' | 'untrusted' | 'unpublished';

/** A trust configuration as `npm trust list --json` prints it for a GitHub provider. */
interface TrustConfig {
    type?: string;
    repository?: string;
    file?: string;
}

const STATE_ICONS: Record<TrustState, string> = {
    trusted: '✅',
    untrusted: '⚠️ ',
    unpublished: '❌',
};

/** The part of `npm profile get --json` the script reads. */
interface NpmProfile {
    tfa: false | { mode: string; pending: boolean };
}

if (import.meta.main) {
    await main();
}

async function main() {
    const npm = await createNpm();
    const user = await npm.read(['whoami']);
    if (user == null) {
        console.error('Not logged in to npm: run `npm login` first.');
        process.exit(1);
    }
    console.log(`npm user: ${user.trim()}\n`);

    // npm refuses every `npm trust` call (403) for an account without two-factor authentication.
    const profile = JSON.parse(await npm.run(['profile', 'get', '--json'])) as NpmProfile;
    if (profile.tfa === false || profile.tfa.pending) {
        console.error(
            'Enable two-factor authentication on the npm account first: npm profile enable-2fa auth-and-writes',
        );
        process.exit(1);
    }

    const packages = await readWorkspacePackages();
    const publishable = packages.filter(pkg => !pkg.private);
    assertNoPrivateDependencies(publishable, packages);

    const states = new Map<WorkspacePackage, TrustState>();
    for (const pkg of publishable) {
        const state = await readTrustState(npm, pkg);
        states.set(pkg, state);
        console.log(`${STATE_ICONS[state]} ${pkg.name} — ${state}`);
    }

    let untrusted = publishable.filter(pkg => states.get(pkg) !== 'trusted');
    if (untrusted.length === 0) {
        console.log('\nEvery public package has a trusted publisher.');
        return;
    }

    const unpublished = untrusted.filter(pkg => states.get(pkg) === 'unpublished');
    if (unpublished.length > 0) {
        const head = (await $`git rev-parse --short HEAD`.quiet().text()).trim();
        const names = unpublished.map(pkg => `${pkg.name}@${pkg.version}`).join(', ');
        console.log(`\nNot on npm yet: ${names}`);
        if (await confirm(`Build and publish them from ${head}?`)) {
            await bootstrap(npm, unpublished);
        } else {
            console.log('Skipped: a package must be on npm before it can get a trusted publisher.');
            untrusted = untrusted.filter(pkg => states.get(pkg) !== 'unpublished');
            if (untrusted.length === 0) {
                return;
            }
        }
    }

    console.log(`\nWithout a trusted publisher: ${untrusted.map(pkg => pkg.name).join(', ')}`);
    if (!(await confirm(`Trust ${REPOSITORY} / ${WORKFLOW} to publish them?`))) {
        return;
    }

    for (const pkg of untrusted) {
        await npm.run(['trust', 'github', pkg.name, '--repo', REPOSITORY, '--file', WORKFLOW, '--yes']);
        console.log(`🔐 ${pkg.name}`);
    }
}

/** Runs npm commands, asking for a one-time password whenever npm requires a new one. */
interface Npm {
    /** Runs a command and returns its output; throws when it fails. */
    run(args: string[]): Promise<string>;
    /** Runs a read-only command and returns its output, or `null` when the package or user is not found. */
    read(args: string[]): Promise<string | null>;
}

/**
 * Creates the npm runner: the installed npm when it has `npm trust`, otherwise the latest npm. With
 * two-factor authentication npm wants a one-time password even to read trust configurations; it is
 * asked for once and reused until npm rejects it.
 */
async function createNpm(): Promise<Npm> {
    const local = await $`npm trust --help`.quiet().nothrow();
    const command = local.exitCode === 0 ? ['npm'] : ['npx', '--yes', 'npm@latest'];
    let otp: string | null = null;

    return {
        run: async args => {
            const output = await execute(args);
            if (output.status !== 'ok') {
                throw new Error(`npm ${args.join(' ')} failed:\n${output.stderr}`);
            }
            return output.stdout;
        },
        read: async args => {
            const output = await execute(args);
            if (output.status === 'not-found') {
                return null;
            }
            if (output.status === 'failed') {
                throw new Error(`npm ${args.join(' ')} failed:\n${output.stderr}`);
            }
            return output.stdout;
        },
    };

    async function execute(args: string[]) {
        for (;;) {
            // Through the environment: `npm trust` rejects an `--otp` flag it does not declare.
            const env = otp == null ? process.env : { ...process.env, npm_config_otp: otp };
            const result = await $`${command} ${args}`.cwd(ROOT).env(env).quiet().nothrow();
            const stdout = result.stdout.toString();
            const stderr = result.stderr.toString();
            if (result.exitCode === 0) {
                return { status: 'ok' as const, stdout, stderr };
            }
            if (stderr.includes('EOTP')) {
                otp = await ask(otp == null ? 'npm one-time password: ' : 'npm rejected the password, a new one: ');
                continue;
            }
            // E404 is a package that was never published; E401 is `whoami` without a login.
            const notFound = stderr.includes('E404') || stderr.includes('E401');
            return { status: notFound ? ('not-found' as const) : ('failed' as const), stdout, stderr };
        }
    }
}

async function readTrustState(npm: Npm, pkg: WorkspacePackage): Promise<TrustState> {
    if ((await npm.read(['view', pkg.name, 'name'])) == null) {
        return 'unpublished';
    }

    const configs = parseTrustList(await npm.run(['trust', 'list', pkg.name, '--json']));
    const trusted = configs.some(
        config => config.type === 'github' && config.repository === REPOSITORY && config.file === WORKFLOW,
    );
    return trusted ? 'trusted' : 'untrusted';
}

/**
 * Parses `npm trust list --json`, which prints one indented JSON object per configuration, one after
 * another, and nothing when there is none.
 */
export function parseTrustList(output: string): TrustConfig[] {
    const trimmed = output.trim();
    if (trimmed === '') {
        return [];
    }

    // Top-level objects close and open at column 0; nested ones are indented.
    return JSON.parse(`[${trimmed.replaceAll(/^\}\s*^\{/gm, '},{')}]`) as TrustConfig[];
}

async function bootstrap(npm: Npm, packages: WorkspacePackage[]) {
    const projects = packages.map(pkg => pkg.name).join(',');
    const build = Bun.spawn(['bun', 'nx', 'run-many', '-t', 'build', '-p', projects], {
        cwd: ROOT,
        stdio: ['inherit', 'inherit', 'inherit'],
    });
    if ((await build.exited) !== 0) {
        throw new Error(`Building ${projects} failed`);
    }

    const outDir = await mkdtemp(path.join(tmpdir(), 'nzyme-bootstrap-'));
    for (const pkg of packages) {
        const tarball = await pack(pkg, outDir);
        await assertNoWorkspaceProtocol(pkg, tarball);
        await npm.run(['publish', tarball, '--access', 'public']);
        console.log(`📦 ${pkg.name}@${pkg.version}`);
    }
}

/** Asks a yes/no question on the terminal; anything but "y" or "yes" is a no. */
async function confirm(question: string) {
    const answer = await ask(`${question} [y/N] `);
    return ['y', 'yes'].includes(answer.toLowerCase());
}

async function ask(question: string) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await readline.question(question)).trim();
    } finally {
        readline.close();
    }
}
