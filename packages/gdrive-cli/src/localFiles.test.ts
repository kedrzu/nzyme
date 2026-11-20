import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';

import { localFile, mimeTypeOf, resolveWritablePath } from './localFiles.js';

let tmp: string;
let repo: string;
let vault: string;
let access: FileAccess;

beforeAll(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gdrive-files-')));
    repo = path.join(tmp, 'repo');
    vault = path.join(tmp, 'Mobile Documents', 'vault');
    await fs.mkdir(path.join(repo, '.context', 'outbox'), { recursive: true });
    await fs.mkdir(path.join(vault, 'Projekty'), { recursive: true });
    await fs.writeFile(path.join(repo, '.context', 'outbox', 'raport.pdf'), 'pdf');
    await fs.writeFile(path.join(repo, '.env'), 'SECRET=1');
    await fs.writeFile(path.join(vault, 'Projekty', 'szafa 1.png'), 'png');
    await fs.writeFile(path.join(tmp, 'outside.txt'), 'nope');
    await fs.symlink(vault, path.join(repo, 'obsidian'));
    await fs.symlink(path.join(tmp, 'outside.txt'), path.join(repo, 'leak.txt'));
    await fs.symlink(tmp, path.join(repo, 'escape'));
    access = { baseDir: repo, roots: [repo, vault] };
});

afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

test('localFile describes the file with a type from its extension', async () => {
    const file = await localFile('obsidian/Projekty/szafa 1.png', access);
    expect(file).toMatchObject({ filename: 'szafa 1.png', mimeType: 'image/png', size: 3 });
});

test('mimeTypeOf knows Markdown and falls back to octet-stream', () => {
    expect(mimeTypeOf('notes.md')).toBe('text/markdown');
    expect(mimeTypeOf('a.csv')).toBe('text/csv');
    expect(mimeTypeOf('blob')).toBe('application/octet-stream');
});

test('resolveWritablePath writes into a directory under the Drive name, creating missing ones', async () => {
    expect(await resolveWritablePath({ input: 'downloads/2026/', defaultName: 'Umowa.pdf', access })).toBe(
        path.join(repo, 'downloads', '2026', 'Umowa.pdf'),
    );
    expect(await resolveWritablePath({ input: 'obsidian/Projekty', defaultName: 'a/b.docx', access })).toBe(
        path.join(vault, 'Projekty', 'a_b.docx'),
    );
    expect(await resolveWritablePath({ input: 'out/x.txt', defaultName: 'ignored', access })).toBe(
        path.join(repo, 'out', 'x.txt'),
    );
});

test('resolveWritablePath does not replace a file unless asked', async () => {
    await expect(
        resolveWritablePath({ input: '.context/outbox/raport.pdf', defaultName: 'x', access }),
    ).rejects.toThrow(/already exists/);
    expect(
        await resolveWritablePath({ input: '.context/outbox/raport.pdf', defaultName: 'x', access, overwrite: true }),
    ).toBe(path.join(repo, '.context', 'outbox', 'raport.pdf'));
});

test('resolveWritablePath refuses targets outside the roots, through symlinks, and secrets', async () => {
    await expect(resolveWritablePath({ input: '../x.txt', defaultName: 'x', access })).rejects.toThrow(/outside/);
    await expect(resolveWritablePath({ input: 'escape/new/x.txt', defaultName: 'x', access })).rejects.toThrow(
        /outside/,
    );
    await expect(fs.stat(path.join(tmp, 'new'))).rejects.toThrow();
    await expect(resolveWritablePath({ input: 'leak.txt', defaultName: 'x', access, overwrite: true })).rejects.toThrow(
        /not a regular file/,
    );
    await expect(resolveWritablePath({ input: '.env.local', defaultName: 'x', access })).rejects.toThrow(/secrets/);
});
