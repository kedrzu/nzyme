import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { assertTotalSize, loadLocalFile, MAX_ATTACHMENTS_BYTES } from './localFiles.js';

let tmp: string;

beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-files-'));
    await fs.writeFile(path.join(tmp, 'szafa 1.png'), 'png');
});

afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

test('loadLocalFile: reads the file with a type from its extension', async () => {
    const a = await loadLocalFile(path.join(tmp, 'szafa 1.png'));
    expect(a).toMatchObject({ filename: 'szafa 1.png', contentType: 'image/png' });
    expect(a.content.toString()).toBe('png');
});

test('limits: rejects more than 25 MB in total', () => {
    const big = { filename: 'a', content: Buffer.alloc(MAX_ATTACHMENTS_BYTES) };
    expect(() => assertTotalSize([big])).not.toThrow();
    expect(() => assertTotalSize([big, { filename: 'b', content: Buffer.alloc(1) }])).toThrow(/25\.0 MB/);
});
