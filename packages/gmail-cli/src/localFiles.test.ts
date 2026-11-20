import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';
import { assertTotalSize, loadLocalFile, MAX_ATTACHMENTS_BYTES } from './localFiles.js';

let tmp: string;
let repo: string;
let vault: string;
let access: FileAccess;

beforeAll(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-files-')));
    repo = path.join(tmp, 'repo');
    vault = path.join(tmp, 'Mobile Documents', 'vault');
    await fs.mkdir(path.join(repo, '.context', 'outbox'), { recursive: true });
    await fs.mkdir(path.join(vault, 'Projekty'), { recursive: true });
    await fs.writeFile(path.join(repo, '.context', 'outbox', 'raport.pdf'), 'pdf');
    await fs.writeFile(path.join(repo, '.env'), 'SECRET=1');
    await fs.writeFile(path.join(repo, '.env.production'), 'SECRET=1');
    await fs.writeFile(path.join(repo, 'work-credentials.json'), '{}');
    await fs.writeFile(path.join(repo, 'work-tokens.json'), '{}');
    await fs.writeFile(path.join(vault, 'Projekty', 'szafa 1.png'), 'png');
    await fs.writeFile(path.join(tmp, 'outside.txt'), 'nope');
    await fs.symlink(vault, path.join(repo, 'obsidian'));
    await fs.symlink(path.join(tmp, 'outside.txt'), path.join(repo, 'leak.txt'));
    access = { baseDir: repo, roots: [repo, vault] };
});

afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

test('loadLocalFile: reads the file with a type from its extension', async () => {
    const a = await loadLocalFile('obsidian/Projekty/szafa 1.png', access);
    expect(a).toMatchObject({ filename: 'szafa 1.png', contentType: 'image/png' });
    expect(a.content.toString()).toBe('png');
});

test('limits: rejects more than 25 MB in total', () => {
    const big = { filename: 'a', content: Buffer.alloc(MAX_ATTACHMENTS_BYTES) };
    expect(() => assertTotalSize([big])).not.toThrow();
    expect(() => assertTotalSize([big, { filename: 'b', content: Buffer.alloc(1) }])).toThrow(/25\.0 MB/);
});
