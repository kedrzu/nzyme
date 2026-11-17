import path from 'node:path';

import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import { getImportSourceKind } from '@nzyme/project-utils/importGraph/extractImportSpecifiers.js';

import type { AffectedConfig } from './AffectedConfig.js';
import type { ChangedFile } from './collectChangedFiles.js';
import { rewriteChangedPath } from './rewriteChangedPath.js';

/** Options of {@link selectAffectedFiles}. */
export interface SelectAffectedFilesOptions {
    graph: ImportGraph;
    changedFiles: ChangedFile[];
    config: Pick<AffectedConfig, 'rewrites' | 'fullRunTriggers' | 'ignore'>;
    /**
     * Selection globs (`Bun.Glob`). One without `/` matches the basename (`*.test.ts`); one with
     * `/` matches the root-relative path (`packages/{ui,app}/**\/*.stories.tsx`).
     */
    patterns: string[];
    /** Root-relative, `/`-separated directories of the workspace packages; `''` is never one. */
    packageDirs: string[];
}

/** What {@link selectAffectedFiles} selected, and why. */
export interface AffectedSelection {
    /** Root-relative paths matching the patterns, sorted and unique; only files that exist. */
    files: string[];
    /** Set when a changed file matches a full-run trigger (the first in path order) or a trigger file imports it. */
    fullRun?: AffectedFullRunReason;
}

/** The changed file that triggered a full run, and the trigger it matched. */
export interface AffectedFullRunReason {
    file: string;
    trigger: string;
    /** The file matching `trigger` that imports `file`, transitively; unset when `file` matches it itself. */
    via?: string;
}

/**
 * Picks the files matching `patterns` that a change can affect: the changed files themselves plus
 * every file that imports one of them, transitively.
 *
 * Per changed file, in order:
 * 1. matches a `fullRunTriggers` glob → every graph file matching the patterns (triggers win over `ignore`);
 * 2. matches an `ignore` glob, or is a `.d.ts` → nothing (Bun erases types when it runs a test, so a
 *    declaration file changes no test outcome; the typecheck covers it);
 * 3. a package's `package.json` → seeds every source file of that package (a dependency change acts on
 *    the whole package and its importers);
 * 4. otherwise a seed; a `rewrites` rule also seeds the rewritten path.
 *
 * A seed of step 4 that a trigger file imports, transitively (a module the test preload or a
 * `.storybook/preview.ts` runs), is a trigger too: it changes what every test runs in.
 *
 * A seed that is not a source file and that nothing imports (a fixture read through `fs`, a codegen
 * input) seeds every file of its owning package — the deepest package directory containing it, or the
 * files outside every package — and so their importers in other packages. A changed file that
 * matched a rewrite rule is exempt: the rule says where its dependents are (`x.loc.yaml` → `x.loc.ts`). Deleted files seed like any other; they are never selected.
 * @__NO_SIDE_EFFECTS__
 */
export function selectAffectedFiles(options: SelectAffectedFilesOptions): AffectedSelection {
    const { graph, changedFiles, config } = options;
    const matchesPattern = createPatternMatcher(options.patterns);
    const findTrigger = createRootGlobMatcher(config.fullRunTriggers);
    const isIgnored = createRootGlobMatcher(config.ignore);
    const existing = new Set(graph.files);
    const { packageDirs } = options;

    const changed = changedFiles.map(file => file.path).toSorted();

    for (const file of changed) {
        const trigger = findTrigger(file);
        if (trigger !== undefined) {
            return { files: graph.files.filter(matchesPattern), fullRun: { file, trigger } };
        }
    }

    const seeds = new Set<string>();
    // The changed files and their rewrite targets: a trigger importing one of them forces a full run.
    const direct: string[] = [];
    const rewritten = new Set<string>();
    const packageDirSet = new Set(packageDirs);

    for (const file of changed) {
        if (isIgnored(file) !== undefined || file.endsWith('.d.ts')) {
            continue;
        }

        seeds.add(file);
        direct.push(file);
        if (path.posix.basename(file) === 'package.json' && packageDirSet.has(path.posix.dirname(file))) {
            const dir = path.posix.dirname(file);
            for (const packageFile of graph.files) {
                if (
                    findOwningPackageDir(packageFile, packageDirs) === dir &&
                    getImportSourceKind(packageFile) !== null
                ) {
                    seeds.add(packageFile);
                }
            }
        }

        for (const target of rewriteChangedPath(file, config.rewrites)) {
            seeds.add(target);
            direct.push(target);
            rewritten.add(file);
        }
    }

    const fullRun = findImportingTrigger(graph, direct, findTrigger);
    if (fullRun) {
        return { files: graph.files.filter(matchesPattern), fullRun };
    }

    const fallbackPackages = new Set<string>();
    for (const seed of seeds) {
        const isFallback =
            !rewritten.has(seed) && getImportSourceKind(seed) === null && graph.importersOf(seed).length === 0;
        if (isFallback) {
            fallbackPackages.add(findOwningPackageDir(seed, packageDirs));
        }
    }

    // The fallback package's files are seeds too, so the walk reaches their importers in other packages.
    if (fallbackPackages.size > 0) {
        for (const file of graph.files) {
            if (fallbackPackages.has(findOwningPackageDir(file, packageDirs))) {
                seeds.add(file);
            }
        }
    }

    // Breadth-first over the importers; `selected` doubles as the visited set, which closes cycles.
    const selected = new Set(seeds);
    const queue = [...seeds];

    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const edge of graph.importersOf(file)) {
            if (!selected.has(edge.from)) {
                selected.add(edge.from);
                queue.push(edge.from);
            }
        }
    }

    const files = [...selected].filter(file => existing.has(file) && matchesPattern(file)).toSorted();
    return { files };
}

/**
 * Walks the importers of `files` (breadth-first, one shared visited set) and returns the first file
 * reached that matches a trigger, with the file it was reached from.
 */
function findImportingTrigger(
    graph: ImportGraph,
    files: string[],
    findTrigger: (file: string) => string | undefined,
): AffectedFullRunReason | undefined {
    const origin = new Map(files.map(file => [file, file]));
    const queue = [...files];

    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const edge of graph.importersOf(file)) {
            if (origin.has(edge.from)) {
                continue;
            }
            const source = origin.get(file) ?? file;
            const trigger = findTrigger(edge.from);
            if (trigger !== undefined) {
                return { file: source, trigger, via: edge.from };
            }
            origin.set(edge.from, source);
            queue.push(edge.from);
        }
    }

    return undefined;
}

/**
 * The selection-pattern rule: a glob without `/` matches the basename, one with `/` the
 * root-relative path.
 */
function createPatternMatcher(patterns: string[]): (file: string) => boolean {
    const globs = patterns.map(pattern => ({ glob: new Bun.Glob(pattern), basename: !pattern.includes('/') }));
    return file => globs.some(({ glob, basename }) => glob.match(basename ? path.posix.basename(file) : file));
}

/** Returns the first glob matching the root-relative path, or `undefined`. */
function createRootGlobMatcher(patterns: string[]): (file: string) => string | undefined {
    const globs = patterns.map(pattern => ({ pattern, glob: new Bun.Glob(pattern) }));
    return file => globs.find(({ glob }) => glob.match(file))?.pattern;
}
