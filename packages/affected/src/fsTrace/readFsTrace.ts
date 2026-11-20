import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { relativeInsidePosixPath } from '@nzyme/project-utils/relativeInsidePosixPath.js';
import { isErrorCode } from '@nzyme/utils/isErrorCode.js';
import { parseNdjson } from '@nzyme/utils/parseNdjson.js';

import type { FsAccesses, SharedFsAccesses } from '../selector/openTestSelector.js';
import type { FsTraceAccessLine, FsTraceLine } from './FsTraceLine.js';

/** The file accesses of a traced run (see {@link readFsTrace}). */
export interface FsTrace {
    /** What each test file accessed while it ran, keyed by its root-relative path. */
    tests: Map<string, FsAccesses>;
    /** What each module other than the test file running accessed, over the whole run. */
    shared: SharedFsAccesses[];
}

/**
 * The file accesses of a traced run (see {@link FsTraceLine}), or `null` when no process of the run was
 * traced (the preload is not loaded, so the run tells nothing about what its tests read). Paths
 * outside `root` or in a `node_modules` are dropped.
 *
 * An access counts for the test file running, and unless the test file made it itself, it is also
 * shared under the module that made it: a built file under its source (the single source its sibling
 * source map names), code outside the root and an access with no such frame under `null`. Shared accesses are collected over the whole run, not per process: a test file that left no
 * trace line has no known process.
 */
export async function readFsTrace(dir: string, root: string): Promise<FsTrace | null> {
    let names: string[];
    try {
        names = await readdir(dir);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }

    // Bun reports `Bun.main` resolved, while a test may access a path through a symlinked root.
    const roots = [...new Set([root, await realpath(root)])];
    const tests = new Map<string, AccessSets>();
    const shared = new Map<string | null, AccessSets>();
    const readers = new Map<string, string | null>();
    let traced = false;
    for (const name of names.toSorted()) {
        if (!name.endsWith('.ndjson')) {
            continue;
        }
        // Written by the preload: its lines are trusted to match the type.
        const lines = parseNdjson(await readFile(path.join(dir, name), 'utf8')) as FsTraceLine[];
        for (const line of lines) {
            if (line.type === 'start') {
                traced = true;
                continue;
            }
            const test = toRootRelative(line.test, roots);
            if (test === null) {
                continue;
            }
            addAccess(tests, test, line);
            const reader = line.reader === undefined ? null : await resolveReader(line.reader);
            if (reader !== test) {
                addAccess(shared, reader, line);
            }
        }
    }

    if (!traced) {
        return null;
    }
    const trace: FsTrace = { tests: new Map(), shared: [] };
    for (const [test, sets] of tests) {
        trace.tests.set(test, toAccesses(sets));
    }
    for (const [reader, sets] of shared) {
        trace.shared.push({ reader, ...toAccesses(sets) });
    }
    return trace;

    function addAccess<K>(map: Map<K, AccessSets>, key: K, line: FsTraceAccessLine): void {
        let sets = map.get(key);
        if (!sets) {
            sets = { read: new Set(), list: new Set(), tree: new Set(), opaque: false };
            map.set(key, sets);
        }
        if (line.kind === 'opaque') {
            sets.opaque = true;
            return;
        }
        const file = toRootRelative(line.path, roots);
        if (file !== null) {
            sets[line.kind].add(file);
        }
    }

    async function resolveReader(file: string): Promise<string | null> {
        let reader = readers.get(file);
        if (reader === undefined) {
            const source = (await readSingleSource(file)) ?? file;
            reader = toRootRelative(source, roots);
            readers.set(file, reader);
        }
        return reader;
    }
}

interface AccessSets {
    read: Set<string>;
    list: Set<string>;
    tree: Set<string>;
    opaque: boolean;
}

function toAccesses(sets: AccessSets): FsAccesses {
    return {
        files: [...sets.read].toSorted(),
        dirs: [...sets.list].toSorted(),
        trees: [...sets.tree].toSorted(),
        opaque: sets.opaque,
    };
}

/**
 * The absolute source a built JavaScript file was compiled from, when its sibling source map
 * (`<file>.map`, as `tsc` writes it) names exactly one.
 */
async function readSingleSource(file: string): Promise<string | undefined> {
    if (!/\.[cm]?js$/.test(file)) {
        return undefined;
    }
    let text: string;
    try {
        text = await readFile(`${file}.map`, 'utf8');
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return undefined;
        }
        throw error;
    }
    const map: unknown = JSON.parse(text);
    if (typeof map !== 'object' || map === null) {
        return undefined;
    }
    const sources: unknown = Reflect.get(map, 'sources');
    const sourceRoot: unknown = Reflect.get(map, 'sourceRoot');
    if (!Array.isArray(sources) || sources.length !== 1 || typeof sources[0] !== 'string') {
        return undefined;
    }
    return path.resolve(path.dirname(file), typeof sourceRoot === 'string' ? sourceRoot : '', sources[0]);
}

/** `/`-separated and relative to one of `roots` (`''` for a root itself), or `null` outside them or in a `node_modules`. */
function toRootRelative(file: string, roots: readonly string[]): string | null {
    for (const root of roots) {
        const posix = relativeInsidePosixPath(root, file);
        if (posix === null) {
            continue;
        }
        return posix.split('/').includes('node_modules') ? null : posix;
    }
    return null;
}
