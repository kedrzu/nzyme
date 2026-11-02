/**
 * Publishes every public workspace package to npm at the version currently in its `package.json`.
 *
 * Runs in the publish job of the release workflow (Nx Release) before the release tag is created, and
 * is safe to run again:
 * a version that is already on the registry is skipped, so a half-finished publish is resumed by
 * re-running the job rather than by bumping the version.
 *
 * Packing goes through `bun pm pack`, which rewrites `workspace:*` dependencies to the exact
 * version; publishing goes through `npm publish`, which supports trusted publishing (OIDC) and
 * provenance. Before anything is published, every package is checked for dependencies npm users
 * could not install — on a private workspace package, or a `workspace:` protocol left in the
 * packed manifest.
 *
 * Usage: `bun scripts/publish.ts [--dry-run]`
 */
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { $, Glob } from 'bun';

/** Dependency name to version specifier, as written in a `package.json` field. */
type Specifiers = Record<string, string>;

/** A workspace package with the dependency specifiers the publish guards check. */
export interface WorkspacePackage {
    dir: string;
    name: string;
    version: string;
    private: boolean;
    /** The runtime-facing fields (`DEPENDENCY_FIELDS`) plus `devDependencies`. */
    specifiers: Record<(typeof DEPENDENCY_FIELDS)[number] | 'devDependencies', Specifiers>;
}

const ROOT = path.resolve(import.meta.dir, '..');
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

if (import.meta.main) {
    await main();
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const packages = await readWorkspacePackages();
    const publishable = packages.filter(pkg => !pkg.private);

    assertNoPrivateDependencies(publishable, packages);
    assertDependencyRanges(publishable);

    const outDir = await mkdtemp(path.join(tmpdir(), 'nzyme-publish-'));
    for (const pkg of publishable) {
        if (await isPublished(pkg)) {
            console.log(`⏭️  ${pkg.name}@${pkg.version} is already published`);
            continue;
        }

        const tarball = await pack(pkg, outDir);
        await assertNoWorkspaceProtocol(pkg, tarball);
        await publish(tarball, dryRun);
        console.log(`✅ ${pkg.name}@${pkg.version}${dryRun ? ' (dry run)' : ''}`);
    }
}

/** Reads every workspace package manifest under `packages` that has a name and a version. */
export async function readWorkspacePackages() {
    const packages: WorkspacePackage[] = [];
    for await (const file of new Glob('packages/*/package.json').scan(ROOT)) {
        const json = (await Bun.file(path.join(ROOT, file)).json()) as Record<string, unknown>;
        if (typeof json['name'] !== 'string' || typeof json['version'] !== 'string') {
            continue;
        }

        const specifiers: WorkspacePackage['specifiers'] = {
            dependencies: {},
            peerDependencies: {},
            optionalDependencies: {},
            devDependencies: {},
        };
        for (const field of Object.keys(specifiers) as (keyof typeof specifiers)[]) {
            const deps = json[field];
            if (deps && typeof deps === 'object') {
                specifiers[field] = deps as Specifiers;
            }
        }

        packages.push({
            dir: path.join(ROOT, path.dirname(file)),
            name: json['name'],
            version: json['version'],
            private: json['private'] === true,
            specifiers,
        });
    }

    return packages.toSorted((a, b) => a.name.localeCompare(b.name));
}

function assertNoPrivateDependencies(publishable: WorkspacePackage[], all: WorkspacePackage[]) {
    const privateNames = new Set(all.filter(pkg => pkg.private).map(pkg => pkg.name));
    const problems: string[] = [];
    for (const pkg of publishable) {
        const names = DEPENDENCY_FIELDS.flatMap(field => Object.keys(pkg.specifiers[field]));
        for (const dep of names) {
            if (privateNames.has(dep)) {
                problems.push(`${pkg.name} depends on private ${dep}`);
            }
        }
    }

    if (problems.length > 0) {
        throw new Error(`Public packages must not depend on private ones:\n${problems.join('\n')}`);
    }
}

/** Throws when `checkDependencyRanges` finds any problem in the public packages. */
function assertDependencyRanges(publishable: WorkspacePackage[]) {
    const problems = checkDependencyRanges(publishable);
    if (problems.length > 0) {
        throw new Error(`Public packages must declare ranges, not exact versions:\n${problems.join('\n')}`);
    }
}

/**
 * Finds dependencies of public packages that would force an exact version on every consumer: an
 * exact semver in a runtime-facing field, or a dev counterpart of a peer whose specifier differs
 * from the peer's (the submodule consumer installs devDependencies too, so it would get two copies).
 * Private packages are ignored.
 *
 * @returns one message per problem, naming package, field, dependency and specifier
 */
export function checkDependencyRanges(packages: WorkspacePackage[]) {
    const problems: string[] = [];
    for (const pkg of packages) {
        if (pkg.private) {
            continue;
        }

        for (const field of DEPENDENCY_FIELDS) {
            for (const [dep, specifier] of Object.entries(pkg.specifiers[field])) {
                if (EXACT_VERSION.test(specifier)) {
                    problems.push(`${pkg.name} ${field}: ${dep} is pinned to ${specifier}`);
                }
            }
        }

        for (const [dep, specifier] of Object.entries(pkg.specifiers.devDependencies)) {
            const peer = pkg.specifiers.peerDependencies[dep];
            if (peer != null && peer !== specifier) {
                problems.push(
                    `${pkg.name} devDependencies: ${dep} is ${specifier} but its peerDependencies range is ${peer}`,
                );
            }
        }
    }

    return problems;
}

async function isPublished(pkg: WorkspacePackage) {
    const result = await $`npm view ${`${pkg.name}@${pkg.version}`} version`.quiet().nothrow();
    if (result.exitCode === 0) {
        return result.stdout.toString().trim() === pkg.version;
    }

    // E404 covers both a missing version and a package that was never published.
    if (result.stderr.toString().includes('E404')) {
        return false;
    }

    throw new Error(`npm view ${pkg.name}@${pkg.version} failed:\n${result.stderr.toString()}`);
}

async function pack(pkg: WorkspacePackage, outDir: string) {
    const destination = await mkdtemp(path.join(outDir, 'pkg-'));
    await $`bun pm pack --destination ${destination} --quiet`.cwd(pkg.dir).quiet();

    const tarball = (await readdir(destination)).find(file => file.endsWith('.tgz'));
    if (!tarball) {
        throw new Error(`bun pm pack produced no tarball for ${pkg.name}`);
    }

    return path.join(destination, tarball);
}

async function assertNoWorkspaceProtocol(pkg: WorkspacePackage, tarball: string) {
    const manifest = await $`tar -xOzf ${tarball} package/package.json`.quiet().text();
    if (manifest.includes('workspace:')) {
        throw new Error(`${pkg.name}: the packed package.json still contains a workspace: dependency`);
    }
}

async function publish(tarball: string, dryRun: boolean) {
    const args = ['--access', 'public'];
    if (dryRun) {
        args.push('--dry-run');
    } else if (process.env['GITHUB_ACTIONS'] === 'true') {
        // Provenance needs the CI's OIDC identity, so it is only requested where one exists.
        args.push('--provenance');
    }

    await $`npm publish ${tarball} ${args}`.quiet();
}
