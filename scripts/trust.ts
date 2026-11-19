/**
 * Makes every public package publishable by the release workflow through npm trusted publishing (OIDC),
 * asking before each step:
 *
 * 1. a package that is not on npm yet is built, packed and published from this checkout, because npm
 *    accepts a trusted publisher only for a package that already exists;
 * 2. every package whose trusted publisher is not proven gets one for `.github/workflows/release.yml`.
 *
 * A package is proven trusted when its latest version was published through a trusted publisher; the
 * others are not checked first, because every call to npm's trust API costs a second factor. Adding a
 * configuration a package already has is left to npm.
 *
 * The npm account needs two-factor authentication. Every write needs a fresh second factor: the script
 * opens npm's browser authentication (a passkey or security key) and waits for it, or asks for a
 * one-time password when the account uses an authenticator app.
 *
 * Bootstrap a new package from the release commit (`origin/release`), so that its first version matches
 * what the release workflow publishes for the others.
 *
 * Usage: `bun trust [package...]` — the package names limit the run to those packages.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { $ } from 'bun';

import { assertNoPrivateDependencies, assertNoWorkspaceProtocol, pack, readWorkspacePackages } from './publish.js';
import type { WorkspacePackage } from './publish.js';

const REPOSITORY = 'kedrzu/nzyme';
const WORKFLOW = 'release.yml';
const REGISTRY = 'https://registry.npmjs.org';
const ROOT = path.resolve(import.meta.dir, '..');

/** Where a package stands with npm trusted publishing, as far as npm tells without a second factor. */
type TrustState = 'trusted' | 'unverified' | 'unpublished';

const STATE_LABELS: Record<TrustState, string> = {
    trusted: '✅ trusted',
    unverified: '❔ no trusted publish yet',
    unpublished: '❌ not on npm',
};

/** The body npm answers with when a request needs a second factor through the browser. */
interface WebAuthChallenge {
    authUrl: string;
    doneUrl: string;
}

/**
 * One line reader for the whole run: a reader per question would swallow the answers piped in after its
 * own, and `node:readline` closes itself at the end of piped input, before the next question.
 */
const answers = console[Symbol.asyncIterator]();

if (import.meta.main) {
    await main();
}

async function main() {
    const token = readRegistryToken(await readFile(path.join(homedir(), '.npmrc'), 'utf8').catch(() => ''));
    if (token == null) {
        console.error('Not logged in to npm: run `npm login` first.');
        process.exit(1);
    }

    const packages = await readWorkspacePackages();
    const publishable = packages.filter(pkg => !pkg.private);
    assertNoPrivateDependencies(publishable, packages);

    const only = process.argv.slice(2);
    const unknown = only.filter(name => !publishable.some(pkg => pkg.name === name));
    if (unknown.length > 0) {
        console.error(`Not a public workspace package: ${unknown.join(', ')}`);
        process.exit(1);
    }
    const selected = only.length > 0 ? publishable.filter(pkg => only.includes(pkg.name)) : publishable;

    const states = new Map<WorkspacePackage, TrustState>();
    for (const pkg of selected) {
        const state = await readTrustState(pkg);
        states.set(pkg, state);
        console.log(`${STATE_LABELS[state]} — ${pkg.name}`);
    }

    let untrusted = selected.filter(pkg => states.get(pkg) !== 'trusted');
    if (untrusted.length === 0) {
        console.log('\nEvery package has published through a trusted publisher.');
        return;
    }

    const unpublished = untrusted.filter(pkg => states.get(pkg) === 'unpublished');
    if (unpublished.length > 0) {
        const head = (await $`git rev-parse --short HEAD`.quiet().text()).trim();
        console.log(`\nNot on npm yet: ${unpublished.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}`);
        if (await confirm(`Build and publish them from ${head}? Each one needs a second factor.`)) {
            await bootstrap(token, unpublished);
        } else {
            console.log('Skipped: a package must be on npm before it can get a trusted publisher.');
            untrusted = untrusted.filter(pkg => states.get(pkg) !== 'unpublished');
            if (untrusted.length === 0) {
                return;
            }
        }
    }

    console.log(`\nTo trust ${REPOSITORY} / ${WORKFLOW}: ${untrusted.map(pkg => pkg.name).join(', ')}`);
    if (!(await confirm(`Add the trusted publisher? Each package needs a second factor.`))) {
        return;
    }

    for (const pkg of untrusted) {
        await addTrustedPublisher(token, pkg);
        console.log(`🔐 ${pkg.name}`);
    }
}

/**
 * Reads the npmjs.org auth token from the contents of an `.npmrc` (`npm config get` refuses to print it).
 *
 * @returns the token, or `null` when the file has none
 */
export function readRegistryToken(npmrc: string) {
    const match = /^\/\/registry\.npmjs\.org\/:_authToken=(.+)$/m.exec(npmrc);
    return match?.[1]?.trim() ?? null;
}

async function readTrustState(pkg: WorkspacePackage): Promise<TrustState> {
    const response = await fetch(`${REGISTRY}/${encodePackageName(pkg.name)}/latest`);
    if (response.status === 404) {
        return 'unpublished';
    }
    if (!response.ok) {
        throw new Error(`Reading ${pkg.name} from npm failed: HTTP ${response.status}`);
    }

    const manifest = (await response.json()) as { _npmUser?: { trustedPublisher?: unknown } };
    return manifest._npmUser?.trustedPublisher == null ? 'unverified' : 'trusted';
}

async function addTrustedPublisher(token: string, pkg: WorkspacePackage) {
    const body = JSON.stringify([
        {
            type: 'github',
            claims: { repository: REPOSITORY, workflow_ref: { file: WORKFLOW } },
            permissions: ['createPackage'],
        },
    ]);
    const response = await requestWithSecondFactor(token, otp =>
        fetch(`${REGISTRY}/-/package/${encodePackageName(pkg.name)}/trust`, {
            method: 'POST',
            headers: { ...authHeaders(token, otp), 'content-type': 'application/json' },
            body,
        }),
    );
    if (!response.ok) {
        throw new Error(
            `Adding the trusted publisher to ${pkg.name} failed: HTTP ${response.status} ${await response.text()}`,
        );
    }
}

async function bootstrap(token: string, packages: WorkspacePackage[]) {
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
        await publishTarball(token, pkg, tarball);
        console.log(`📦 ${pkg.name}@${pkg.version}`);
    }
}

/**
 * Publishes through `npm publish`, with a second factor the script obtained itself: npm prints its own
 * browser link redacted when it is not attached to a terminal. The factor is asked for on a read of the
 * package's trust configurations, which needs one too, and handed to npm as its `otp` setting.
 */
async function publishTarball(token: string, pkg: WorkspacePackage, tarball: string) {
    const probe = await fetch(`${REGISTRY}/-/package/${encodePackageName('@nzyme/utils')}/trust`, {
        headers: authHeaders(token, null),
    });
    const otp = await obtainSecondFactor(token, probe);

    const result = await $`npm publish ${tarball} --access public`
        .cwd(ROOT)
        .env({ ...process.env, npm_config_otp: otp })
        .quiet()
        .nothrow();
    if (result.exitCode !== 0) {
        throw new Error(`npm publish ${pkg.name} failed:\n${result.stderr.toString()}`);
    }
}

/**
 * Sends a request, and when npm answers that it needs a second factor, obtains one and sends it again:
 * through the browser when npm offers it (a passkey or security key), otherwise as a one-time password
 * typed in. A second factor is good for one request only.
 */
async function requestWithSecondFactor(token: string, send: (otp: string | null) => Promise<Response>) {
    const first = await send(null);
    if (first.status !== 401) {
        return first;
    }

    return await send(await obtainSecondFactor(token, first));
}

/** Obtains a second factor for npm's 401 answer to a request that needs one. */
async function obtainSecondFactor(token: string, response: Response) {
    if (response.status !== 401) {
        throw new Error(`npm asked for no second factor: HTTP ${response.status}`);
    }

    const challenge = (await response.json().catch(() => null)) as Partial<WebAuthChallenge> | null;
    if (challenge?.authUrl != null && challenge.doneUrl != null) {
        return await authenticateInBrowser(token, { authUrl: challenge.authUrl, doneUrl: challenge.doneUrl });
    }

    return await ask('npm one-time password: ');
}

async function authenticateInBrowser(token: string, challenge: WebAuthChallenge) {
    console.log(`Confirm in the browser: ${challenge.authUrl}`);
    await $`open ${challenge.authUrl}`.quiet().nothrow();

    for (;;) {
        const response = await fetch(challenge.doneUrl, { headers: authHeaders(token, null) });
        if (response.status === 200) {
            const { token: otp } = (await response.json()) as { token: string };
            return otp;
        }
        if (response.status !== 202) {
            throw new Error(`npm browser authentication failed: HTTP ${response.status} ${await response.text()}`);
        }
        const retryAfter = Number(response.headers.get('retry-after') ?? '1');
        await Bun.sleep(Math.max(retryAfter, 1) * 1000);
    }
}

function authHeaders(token: string, otp: string | null): Record<string, string> {
    return {
        authorization: `Bearer ${token}`,
        'npm-auth-type': 'web',
        ...(otp == null ? {} : { 'npm-otp': otp }),
    };
}

function encodePackageName(name: string) {
    return name.replace('/', '%2f');
}

/** Asks a yes/no question on the terminal; anything but "y" or "yes" is a no. */
async function confirm(question: string) {
    const answer = await ask(`${question} [y/N] `);
    return ['y', 'yes'].includes(answer.toLowerCase());
}

async function ask(question: string) {
    process.stdout.write(question);
    const answer = await answers.next();
    return answer.done ? '' : answer.value.trim();
}
