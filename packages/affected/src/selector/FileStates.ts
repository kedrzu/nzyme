import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { getMd5Hash } from '@nzyme/crypto';

import type { FileFingerprintResult } from '../fingerprint/FileFingerprint.js';
import { FingerprintCache } from '../fingerprint/FingerprintCache.js';
import type { FileHash } from '../store/VariantStore.js';

/** A file's content as hashed now: the MD5 of its bytes and its fingerprint. */
export interface FileState {
    raw: string;
    fingerprint: FileFingerprintResult;
    mtimeMs: number;
}

/** How much of a file a variant depends on (see {@link FileHash}). */
export type FileHashLevel = 'full' | 'top';

/**
 * Reads root-relative files of one project for hashing. Fingerprints are cached by mtime and size
 * for the life of the object (see {@link FingerprintCache}); nothing is persisted.
 */
export class FileStates {
    private readonly fingerprints = new FingerprintCache();

    constructor(readonly root: string) {}

    /** The state of a root-relative file, or `null` when it does not exist. */
    async read(file: string): Promise<FileState | null> {
        const absolute = path.join(this.root, file);
        const stats = await stat(absolute).catch(() => null);
        if (!stats?.isFile()) {
            return null;
        }

        const [bytes, fingerprint] = await Promise.all([readFile(absolute), this.fingerprints.fingerprint(absolute)]);
        return { raw: getMd5Hash(bytes), fingerprint, mtimeMs: stats.mtimeMs };
    }
}

/**
 * The hash a variant stores for a file at `level`; a file with no structure to split is hashed by
 * its bytes whatever the level.
 * @__NO_SIDE_EFFECTS__
 */
export function toFileHash(state: FileState, level: FileHashLevel): FileHash {
    if (state.fingerprint === 'whole') {
        return state.raw;
    }
    return level === 'full'
        ? { body: state.fingerprint.body, top: state.fingerprint.top }
        : { top: state.fingerprint.top };
}

/**
 * Whether a file is unchanged as far as a stored hash depends on it. A missing file never matches,
 * and neither does a file that was split and no longer is, or the other way round.
 * @__NO_SIDE_EFFECTS__
 */
export function matchesFileHash(stored: FileHash, state: FileState | null): boolean {
    if (state === null) {
        return false;
    }
    if (typeof stored === 'string') {
        return state.fingerprint === 'whole' && state.raw === stored;
    }
    if (state.fingerprint === 'whole') {
        return false;
    }
    return (
        state.fingerprint.top === stored.top && (stored.body === undefined || state.fingerprint.body === stored.body)
    );
}
