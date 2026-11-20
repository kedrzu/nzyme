import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { resolveReadableFile } from './FileAccess.js';
import type { FileAccess } from './FileAccess.js';

const SECRET_FILES = [
    '.env',
    '.env.production',
    'work-credentials.json',
    'work-tokens.json',
    'client_secret_123-abc.apps.googleusercontent.com.json',
    'credentials.json',
    'token.json',
    'tokens.json',
];

let tmp: string;
let repo: string;
let vault: string;
let access: FileAccess;

beforeAll(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'node-utils-files-')));
    repo = path.join(tmp, 'repo');
    vault = path.join(tmp, 'Mobile Documents', 'vault');
    await fs.mkdir(path.join(repo, '.context', 'outbox'), { recursive: true });
    await fs.mkdir(path.join(vault, 'Projekty'), { recursive: true });
    await fs.writeFile(path.join(repo, '.context', 'outbox', 'raport.pdf'), 'pdf');
    for (const name of SECRET_FILES) {
        await fs.writeFile(path.join(repo, name), 'SECRET=1');
    }
    await fs.writeFile(path.join(vault, 'Projekty', 'szafa 1.png'), 'png');
    await fs.writeFile(path.join(tmp, 'outside.txt'), 'nope');
    await fs.symlink(vault, path.join(repo, 'obsidian'));
    await fs.symlink(path.join(tmp, 'outside.txt'), path.join(repo, 'leak.txt'));
    access = { baseDir: repo, roots: [repo, vault] };
});

afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

test('accepts relative, absolute and root-via-symlink paths', async () => {
    const pdf = path.join(repo, '.context', 'outbox', 'raport.pdf');
    expect(await resolveReadableFile('.context/outbox/raport.pdf', access)).toBe(pdf);
    expect(await resolveReadableFile(pdf, access)).toBe(pdf);
    expect(await resolveReadableFile('obsidian/Projekty/szafa 1.png', access)).toBe(
        path.join(vault, 'Projekty', 'szafa 1.png'),
    );
});

test('refuses anything outside the roots, a symlink pointing out among it', async () => {
    await expect(resolveReadableFile('../outside.txt', access)).rejects.toThrow(/outside/);
    await expect(resolveReadableFile('leak.txt', access)).rejects.toThrow(/outside/);
    await expect(resolveReadableFile('/etc/hosts', access)).rejects.toThrow(/outside/);
});

test('refuses every secret-file name pattern inside a root', async () => {
    for (const name of SECRET_FILES) {
        await expect(resolveReadableFile(name, access)).rejects.toThrow(/secrets file/);
    }
});

test('refuses directories, missing files and ~', async () => {
    await expect(resolveReadableFile('obsidian/Projekty', access)).rejects.toThrow(/regular file/);
    await expect(resolveReadableFile('nope.png', access)).rejects.toThrow(/not found/);
    await expect(resolveReadableFile('~/a.png', access)).rejects.toThrow(/absolute/);
});
