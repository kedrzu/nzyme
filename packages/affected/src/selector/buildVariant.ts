import path from 'node:path';

import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import type { ImportResolver } from '@nzyme/project-utils/importGraph/resolveImportTarget.js';

import type { FileHash, TestUnit, Variant } from '../store/VariantStore.js';
import type { FsAccesses, FsReads } from './openTestSelector.js';
import { collectImportClosure } from './collectImportClosure.js';
import { getFileListingKey, hashFileList, listFiles } from './FileListing.js';
import type { FileListing } from './FileListing.js';
import type { FileHashLevel } from './FileStates.js';
import { runsOnlyOnLoad, toFileHash } from './FileStates.js';
import { buildSuiteFingerprint } from './suiteFingerprint.js';
import type { ReadFileState } from './suiteFingerprint.js';

/** Options of {@link buildVariant}. */
export interface BuildVariantOptions {
    root: string;
    graph: ImportGraph;
    resolver: ImportResolver;
    /** Root-relative directories of the workspace packages; `''` is never one. */
    packageDirs: string[];
    /** Whether a root-relative file matches an `ignore` glob of the config. */
    isIgnored: (file: string) => boolean;
    /** Whether the suite traces execution: an untraced test depends on all its import closure in full. */
    traced: boolean;
    unit: TestUnit;
    /** Root-relative files the test runs from: its own file and its test-side helpers. */
    entry: string[];
    /** Root-relative files whose functions ran for this test. */
    executed: string[];
    /** Root-relative files whose functions ran in a server process anywhere in the run (`TestRun.runExecuted`). */
    runExecuted: string[];
    /** Root-relative non-code files the test loaded (an image the browser fetched). */
    assets: string[];
    /** Root-relative files whose functions ran at startup, before any test. */
    startup: string[];
    /** What the test accessed through the file system, when its run was traced (`TestRun.fsReads`). */
    fsReads?: FsReads;
    /** Hash of the suite's selection config. */
    config: string;
    /** Root-relative globs of the suite's full-run triggers. */
    triggers: string[];
    readState: ReadFileState;
    recordedAt: string;
}

/** The variant, or the file it depends on that no longer exists. */
export type BuildVariantResult = { variant: Variant } | { missing: string };

/**
 * Hashes what one passing run of a test depended on:
 * - entry files and everything they import, transitively — in full: the test side is not traced,
 *   so any runtime change to it counts;
 * - executed files — in full;
 * - everything executed files import statically, transitively — `top` only: their load-time code
 *   ran, their function bodies did not (or they would be executed files themselves). Except a file a
 *   server process ran anywhere in the run: in full, since code that ran once and kept state (a lazy
 *   singleton's setup) served this test too;
 * - every module an executed file loads through a literal `import('…')` whose code all runs on load
 *   (constants, a data table, config — see {@link runsOnlyOnLoad}), and what it imports statically
 *   — `top` only, by the same rule: the trace sees only functions, so such a module is never an
 *   executed file. A lazily loaded module with functions is not followed: if the test reached it, its
 *   functions ran and it is an executed file itself, and following a router's lazy routes would tie
 *   every test to every page. The trace says which files ran, not which functions, so the module is
 *   followed even when the function holding the `import()` did not run;
 * - assets — in full; most have no structure to split, so they are hashed by bytes;
 * - every file under the directory of a file above with a computed `import(…)`, which may load any
 *   of them — in full, and so is what they import when the suite is not traced (a traced run lists
 *   what ran);
 * - the `package.json` of every workspace package owning one of the files above — in full, as the base
 *   diff treats a package's manifest as a change of all its files: its dependencies, `exports` and
 *   `imports` decide what the package's code loads. A file outside every package belongs to the
 *   root, whose manifest is the root `package.json`;
 * - the files of each such package that nothing imports (fixtures, data a test reads through `fs`) —
 *   in full, as the base diff seeds the whole package from a change to one; for the root, the files
 *   outside every package. Not when the run traced the test's file accesses and the test did nothing
 *   the trace cannot see (`FsReads.opaque`): its reads below say exactly what it read;
 * - the files the test read through the file system, where it traced them — in full, wherever they
 *   are, an `ignore` glob notwithstanding, as long as they are walked files; and the list of each
 *   directory whose entries it read. With them, what any module among the files above read in another
 *   test file of the run, which it may have kept and served to this one without reading it again;
 *   and what code that is no walked file (outside the root, or no frame to tell) read anywhere in
 *   the run.
 *
 * The last two sets are {@link FileListing}s: the variant also stores the digest of each one's file
 * list, so a file appearing in it or leaving it is a change. A read reaching into another package (a
 * test reading every package's manifest) is still not seen: such an input must be a full-run trigger.
 *
 * A file whose structure cannot be split is hashed by its bytes at any level. The suite fingerprint
 * (see {@link buildSuiteFingerprint}) is scanned from the test's files and the startup files.
 */
export async function buildVariant(options: BuildVariantOptions): Promise<BuildVariantResult> {
    const { graph } = options;
    const levels = new Map<string, FileHashLevel>();
    const full = [
        ...options.entry,
        ...collectImportClosure(graph, options.entry),
        ...options.executed,
        ...options.assets,
    ];
    for (const file of full) {
        levels.set(file, 'full');
    }
    const ranInRun = new Set(options.runExecuted);
    const loadedLazily = await collectLoadOnlyLazyImports(graph, options.executed, options.readState);
    for (const file of [
        ...loadedLazily,
        ...collectImportClosure(graph, [...options.executed, ...loadedLazily], { staticOnly: true }),
    ]) {
        if (!levels.has(file)) {
            levels.set(file, ranInRun.has(file) ? 'full' : 'top');
        }
    }

    const { suite, computedDynamicImports } = await buildSuiteFingerprint({
        root: options.root,
        graph,
        resolver: options.resolver,
        config: options.config,
        triggers: options.triggers,
        startup: options.startup,
        scanned: [...levels.keys(), ...options.startup],
        readState: options.readState,
    });

    const context = { files: graph.files, packageDirs: options.packageDirs, isIgnored: options.isIgnored };
    const listings: Record<string, string> = {};

    for (const file of computedDynamicImports) {
        const dir = path.posix.dirname(file);
        const loadable = addListing({ kind: 'directory', dir: dir === '.' ? '' : dir });
        if (!options.traced) {
            for (const imported of collectImportClosure(graph, loadable)) {
                levels.set(imported, 'full');
            }
        }
    }

    const walked = new Set(graph.files);
    const fsReads =
        options.fsReads && mergeSharedAccesses({ reads: options.fsReads, loaded: new Set(levels.keys()), walked });
    const owners = new Set<string>();
    for (const file of levels.keys()) {
        owners.add(findOwningPackageDir(file, options.packageDirs));
    }
    // An opaque test (a process, a worker, the Bun shell, a recursive copy) may have read anything.
    const listsPackages = fsReads === undefined || fsReads.opaque;
    for (const owner of owners) {
        levels.set(owner === '' ? 'package.json' : `${owner}/package.json`, 'full');
        if (listsPackages) {
            addListing({ kind: 'package', dir: owner });
        }
    }

    if (fsReads) {
        for (const file of fsReads.files) {
            if (walked.has(file)) {
                levels.set(file, 'full');
            }
        }
        for (const dir of fsReads.dirs) {
            addListing({ kind: 'entries', dir }, { hashFiles: false });
        }
        for (const dir of fsReads.trees) {
            addListing({ kind: 'tree', dir }, { hashFiles: false });
        }
    }

    const files: Record<string, FileHash> = {};
    for (const [file, level] of [...levels].toSorted(([a], [b]) => (a < b ? -1 : 1))) {
        const state = await options.readState(file);
        if (state === null) {
            return { missing: file };
        }
        files[file] = toFileHash(state, level);
    }

    return { variant: { unit: options.unit, files, listings, suite, recordedAt: options.recordedAt } };

    /** Adds a listing's digest, and unless told otherwise its files in full; returns the files. */
    function addListing(listing: FileListing, { hashFiles = true } = {}): string[] {
        const listed = listFiles(listing, context);
        listings[getFileListingKey(listing)] = hashFileList(listed);
        if (hashFiles) {
            for (const file of listed) {
                levels.set(file, 'full');
            }
        }
        return listed;
    }
}

/**
 * The modules `executed` files load through a literal `import('…')` whose code all runs on load,
 * transitively: such a module has no function, so whatever it imports dynamically it imports on load.
 */
async function collectLoadOnlyLazyImports(
    graph: ImportGraph,
    executed: readonly string[],
    readState: ReadFileState,
): Promise<Set<string>> {
    const found = new Set<string>();
    const queue = [...executed];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const edge of graph.importsOf(file)) {
            if (!edge.dynamic || found.has(edge.to)) {
                continue;
            }
            const state = await readState(edge.to);
            if (state !== null && runsOnlyOnLoad(state)) {
                found.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    return found;
}

/** Params of {@link mergeSharedAccesses}. */
export interface MergeSharedAccessesParams {
    reads: FsReads;
    /** The files the test loads. */
    loaded: ReadonlySet<string>;
    /** Every file of the import graph. */
    walked: ReadonlySet<string>;
}

/**
 * The test's own accesses together with those shared by a module it loads (`loaded`), by a `null`
 * reader, and by a reader that is no walked file — which no test's files can show it does not load.
 */
function mergeSharedAccesses({ reads, loaded, walked }: MergeSharedAccessesParams): FsAccesses {
    const files = new Set(reads.files);
    const dirs = new Set(reads.dirs);
    const trees = new Set(reads.trees);
    let opaque = reads.opaque;
    for (const shared of reads.shared) {
        if (shared.reader !== null && walked.has(shared.reader) && !loaded.has(shared.reader)) {
            continue;
        }
        for (const file of shared.files) {
            files.add(file);
        }
        for (const dir of shared.dirs) {
            dirs.add(dir);
        }
        for (const dir of shared.trees) {
            trees.add(dir);
        }
        opaque ||= shared.opaque;
    }
    return { files: [...files], dirs: [...dirs], trees: [...trees], opaque };
}
