import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import type { ImportResolver } from '@nzyme/project-utils/importGraph/resolveImportTarget.js';

import type { FileHash, TestUnit, Variant } from '../store/VariantStore.js';
import { collectImportClosure } from './collectImportClosure.js';
import type { FileHashLevel } from './FileStates.js';
import { toFileHash } from './FileStates.js';
import { buildSuiteFingerprint } from './suiteFingerprint.js';
import type { ReadFileState } from './suiteFingerprint.js';

/** Options of {@link buildVariant}. */
export interface BuildVariantOptions {
    root: string;
    graph: ImportGraph;
    resolver: ImportResolver;
    /** Root-relative directories of the workspace packages; `''` is never one. */
    packageDirs: string[];
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
 *   ran, their function bodies did not (or they would be executed files themselves). A dynamic
 *   `import('…')` is not followed: a lazily loaded module the test reached ran, so it is an executed
 *   file itself. Except a file a server process ran anywhere in the run: in full, since code that
 *   ran once and kept state (a lazy singleton's setup) served this test too;
 * - assets — in full; most have no structure to split, so they are hashed by bytes;
 * - the `package.json` of every workspace package owning one of the files above — in full, as the base
 *   diff treats a package's manifest as a change of all its files: its dependencies, `exports` and
 *   `imports` decide what the package's code loads.
 *
 * A file whose structure cannot be split is hashed by its bytes at any level. The suite fingerprint
 * (see {@link buildSuiteFingerprint}) is scanned from these files and the startup files.
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
    for (const file of collectImportClosure(graph, options.executed, { staticOnly: true })) {
        if (!levels.has(file)) {
            levels.set(file, ranInRun.has(file) ? 'full' : 'top');
        }
    }

    for (const file of levels.keys()) {
        const owner = findOwningPackageDir(file, options.packageDirs);
        if (owner !== '') {
            levels.set(`${owner}/package.json`, 'full');
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

    const suite = await buildSuiteFingerprint({
        root: options.root,
        graph,
        resolver: options.resolver,
        config: options.config,
        triggers: options.triggers,
        startup: options.startup,
        scanned: [...levels.keys(), ...options.startup],
        readState: options.readState,
    });

    return { variant: { unit: options.unit, files, suite, recordedAt: options.recordedAt } };
}
