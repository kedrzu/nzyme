import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { fingerprintFile } from './fingerprintFile.js';

interface CacheEntry {
    mtimeNs: bigint;
    size: bigint;
    result: FileFingerprintResult;
}

/**
 * Fingerprints files on disk, reusing a result while the file's mtime and size are unchanged.
 *
 * The cache lives in process memory only and is never persisted: a cache shared across worktrees
 * would hand one worktree the hash of another worktree's file at the same mtime and size.
 */
export class FingerprintCache {
    private readonly entries = new Map<string, CacheEntry>();

    /** Fingerprints the file at an absolute path (see {@link fingerprintFile}). */
    async fingerprint(path: string): Promise<FileFingerprintResult> {
        if (!isAbsolute(path)) {
            throw new Error(`FingerprintCache expects an absolute path, got "${path}".`);
        }

        const { mtimeNs, size } = await stat(path, { bigint: true });
        const cached = this.entries.get(path);
        if (cached && cached.mtimeNs === mtimeNs && cached.size === size) {
            return cached.result;
        }

        const result = fingerprintFile(path, await readFile(path, 'utf8'));
        this.entries.set(path, { mtimeNs, size, result });
        return result;
    }
}
