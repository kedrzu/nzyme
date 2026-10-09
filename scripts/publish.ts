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

interface WorkspacePackage {
    dir: string;
    name: string;
    version: string;
    private: boolean;
    dependencies: string[];
}

const ROOT = path.resolve(import.meta.dir, '..');
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

await main();

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const packages = await readWorkspacePackages();
    const publishable = packages.filter(pkg => !pkg.private);

    assertNoPrivateDependencies(publishable, packages);

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

async function readWorkspacePackages() {
    const packages: WorkspacePackage[] = [];
    for await (const file of new Glob('packages/*/package.json').scan(ROOT)) {
        const json = (await Bun.file(path.join(ROOT, file)).json()) as Record<string, unknown>;
        if (typeof json['name'] !== 'string' || typeof json['version'] !== 'string') {
            continue;
        }

        const dependencies: string[] = [];
        for (const field of DEPENDENCY_FIELDS) {
            const deps = json[field];
            if (deps && typeof deps === 'object') {
                dependencies.push(...Object.keys(deps));
            }
        }

        packages.push({
            dir: path.join(ROOT, path.dirname(file)),
            name: json['name'],
            version: json['version'],
            private: json['private'] === true,
            dependencies,
        });
    }

    return packages.toSorted((a, b) => a.name.localeCompare(b.name));
}

function assertNoPrivateDependencies(publishable: WorkspacePackage[], all: WorkspacePackage[]) {
    const privateNames = new Set(all.filter(pkg => pkg.private).map(pkg => pkg.name));
    const problems: string[] = [];
    for (const pkg of publishable) {
        for (const dep of pkg.dependencies) {
            if (privateNames.has(dep)) {
                problems.push(`${pkg.name} depends on private ${dep}`);
            }
        }
    }

    if (problems.length > 0) {
        throw new Error(`Public packages must not depend on private ones:\n${problems.join('\n')}`);
    }
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
