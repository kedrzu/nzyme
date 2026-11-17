import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FingerprintCache } from './FingerprintCache.js';
import { fingerprintFile } from './fingerprintFile.js';

test('a file rewritten on disk is fingerprinted again', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fingerprint-cache-'));
    try {
        const file = path.join(dir, 'handler.ts');
        const before = 'export function f() { return 1; }';
        const after = 'export function f() { return 22; }';
        const cache = new FingerprintCache();

        await writeFile(file, before);
        expect(await cache.fingerprint(file)).toEqual(fingerprintFile(file, before));

        await writeFile(file, after);
        expect(await cache.fingerprint(file)).toEqual(fingerprintFile(file, after));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
