import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';

import type { BuildInfoReader } from '../build/createBuildInfoReader.js';

/** Options of {@link findStaleBuildFile}. */
export interface FindStaleBuildFileOptions {
    root: string;
    graph: ImportGraph;
    /** Root-relative directories of the workspace packages. */
    packageDirs: readonly string[];
    /** Root-relative files the test runs from: its own file and its test-side helpers. */
    entry: readonly string[];
    buildInfos: BuildInfoReader;
}

/**
 * The first file, in path order, that a test of a static suite loaded from a build not made from
 * the file's current content, or `null`. The import graph resolves a workspace package's imports to
 * its sources (the `source` export condition), but Bun and Vitest load the package's build (`import`,
 * `default`), so a variant hashing the sources says nothing about what ran unless the build matches them.
 *
 * Only files the run loaded from a build are checked: a file reached across a workspace-package
 * boundary (its package differs from its importer's) and everything reached from it. Files of the
 * test's own package reached only from that package run from source. A checked file is stale when a
 * TypeScript build info of its package — `*.tsbuildinfo` in the package directory or one directly
 * below it (`dist/`) — lists it and none records the XXH3-128 of its current text; a file no build
 * info lists (a `.vue` file tsgo does not compile) runs from source.
 */
export async function findStaleBuildFile(options: FindStaleBuildFileOptions): Promise<string | null> {
    const { root, packageDirs, buildInfos } = options;
    const buildInfoDirs = new Map<string, Promise<string[]>>();

    for (const file of [...collectBuiltFiles(options)].toSorted()) {
        const owner = findOwningPackageDir(file, packageDirs);
        if (owner === '') {
            continue;
        }

        const absolute = path.join(root, file);
        const versions = (await listBuildInfoDirs(owner)).flatMap(dir => buildInfos.readVersions(dir, absolute));
        if (versions.length === 0) {
            continue;
        }
        // A missing file is the variant's own refusal.
        const text = await readFile(absolute, 'utf8').catch(() => null);
        if (text !== null && !versions.includes(buildInfos.hashText(text))) {
            return file;
        }
    }
    return null;

    function listBuildInfoDirs(packageDir: string): Promise<string[]> {
        let dirs = buildInfoDirs.get(packageDir);
        if (!dirs) {
            const absolute = path.join(root, packageDir);
            dirs = readdir(absolute, { withFileTypes: true })
                .catch(() => [])
                .then(entries => [
                    absolute,
                    ...entries
                        .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
                        .map(entry => path.join(absolute, entry.name)),
                ]);
            buildInfoDirs.set(packageDir, dirs);
        }
        return dirs;
    }
}

/** The files of the entry's import closure the run loaded from a package build. */
function collectBuiltFiles({ graph, packageDirs, entry }: FindStaleBuildFileOptions): Set<string> {
    const fromSource = new Set<string>();
    const fromBuild = new Set<string>();
    const queue: { file: string; built: boolean }[] = entry.map(file => ({ file, built: false }));

    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const owner = findOwningPackageDir(next.file, packageDirs);
        for (const { to } of graph.importsOf(next.file)) {
            const built = next.built || findOwningPackageDir(to, packageDirs) !== owner;
            const visited = built ? fromBuild : fromSource;
            if (!visited.has(to)) {
                visited.add(to);
                queue.push({ file: to, built });
            }
        }
    }
    return fromBuild;
}
