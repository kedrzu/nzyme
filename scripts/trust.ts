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
import { stdin, stdout } from 'node:process';
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

if (import.meta.main) {
    await main();
}

async function main() {
    const npm = await resolveNpm();
    const user = await $`${npm} whoami`.quiet().nothrow();
    if (user.exitCode !== 0) {
        console.error('Not logged in to npm: run `npm login` first.');
        process.exit(1);
    }
    console.log(`npm user: ${user.stdout.toString().trim()}\n`);

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
        if (await ask(`Build and publish them from ${head}?`)) {
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
    if (!(await ask(`Trust ${REPOSITORY} / ${WORKFLOW} to publish them?`))) {
        return;
    }

    for (const pkg of untrusted) {
        await run([...npm, 'trust', 'github', pkg.name, '--repo', REPOSITORY, '--file', WORKFLOW, '--yes']);
        console.log(`🔐 ${pkg.name}`);
    }
}

/** The npm command to run: the installed one when it has `npm trust`, otherwise the latest npm. */
async function resolveNpm() {
    const local = await $`npm trust --help`.quiet().nothrow();
    return local.exitCode === 0 ? ['npm'] : ['npx', '--yes', 'npm@latest'];
}

async function readTrustState(npm: string[], pkg: WorkspacePackage): Promise<TrustState> {
    const view = await $`${npm} view ${pkg.name} name`.quiet().nothrow();
    if (view.exitCode !== 0) {
        if (view.stderr.toString().includes('E404')) {
            return 'unpublished';
        }
        throw new Error(`npm view ${pkg.name} failed:\n${view.stderr.toString()}`);
    }

    const list = await $`${npm} trust list ${pkg.name} --json`.quiet().nothrow();
    if (list.exitCode !== 0) {
        throw new Error(`npm trust list ${pkg.name} failed:\n${list.stderr.toString()}`);
    }

    const configs = parseTrustList(list.stdout.toString());
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

async function bootstrap(npm: string[], packages: WorkspacePackage[]) {
    const projects = packages.map(pkg => pkg.name).join(',');
    await run(['bun', 'nx', 'run-many', '-t', 'build', '-p', projects]);

    const outDir = await mkdtemp(path.join(tmpdir(), 'nzyme-bootstrap-'));
    for (const pkg of packages) {
        const tarball = await pack(pkg, outDir);
        await assertNoWorkspaceProtocol(pkg, tarball);
        await run([...npm, 'publish', tarball, '--access', 'public']);
        console.log(`📦 ${pkg.name}@${pkg.version}`);
    }
}

/** Runs a command attached to the terminal, so npm can ask for the second factor. */
async function run(command: string[]) {
    const proc = Bun.spawn(command, { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`${command.join(' ')} failed with exit code ${exitCode}`);
    }
}

/** Asks a yes/no question on the terminal; anything but "y" or "yes" is a no. */
async function ask(question: string) {
    const readline = createInterface({ input: stdin, output: stdout });
    try {
        const answer = await readline.question(`${question} [y/N] `);
        return ['y', 'yes'].includes(answer.trim().toLowerCase());
    } finally {
        readline.close();
    }
}
