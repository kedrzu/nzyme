import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { relativeInsidePosixPath } from '@nzyme/project-utils/relativeInsidePosixPath.js';
import { isErrorCode } from '@nzyme/utils/isErrorCode.js';
import { parseNdjson } from '@nzyme/utils/parseNdjson.js';

import type { FsReads } from '../selector/openTestSelector.js';
import type { FsTraceLine } from './FsTraceLine.js';

/**
 * The file accesses of each test file in a traced run (see {@link FsTraceLine}), keyed by its
 * root-relative path, or `null` when no process of the run was traced (the preload is not loaded,
 * so the run tells nothing about what its tests read). Paths outside `root` or in a `node_modules`
 * are dropped; a file the same test file wrote is not one of its reads.
 */
export async function readFsTrace(dir: string, root: string): Promise<Map<string, FsReads> | null> {
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
    const accesses = new Map<string, TestAccesses>();
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
            let entry = accesses.get(test);
            if (!entry) {
                entry = { read: new Set(), list: new Set(), tree: new Set(), write: new Set(), opaque: false };
                accesses.set(test, entry);
            }
            if (line.kind === 'opaque') {
                entry.opaque = true;
                continue;
            }
            const file = toRootRelative(line.path, roots);
            if (file !== null) {
                entry[line.kind].add(file);
            }
        }
    }

    if (!traced) {
        return null;
    }
    const reads = new Map<string, FsReads>();
    for (const [test, entry] of accesses) {
        reads.set(test, {
            files: [...entry.read].filter(file => !entry.write.has(file)).toSorted(),
            dirs: [...entry.list].toSorted(),
            trees: [...entry.tree].toSorted(),
            opaque: entry.opaque,
        });
    }
    return reads;
}

interface TestAccesses {
    read: Set<string>;
    list: Set<string>;
    tree: Set<string>;
    write: Set<string>;
    opaque: boolean;
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
