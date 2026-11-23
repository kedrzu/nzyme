import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { localFile, mimeTypeOf, resolveWritablePath } from './localFiles.js';

let tmp: string;

beforeAll(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gdrive-files-')));
    await fs.mkdir(path.join(tmp, 'Projekty'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'Projekty', 'szafa 1.png'), 'png');
    await fs.writeFile(path.join(tmp, 'raport.pdf'), 'pdf');
});

afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

test('localFile describes the file with a type from its extension', async () => {
    const file = await localFile(path.join(tmp, 'Projekty', 'szafa 1.png'));
    expect(file).toMatchObject({ filename: 'szafa 1.png', mimeType: 'image/png', size: 3 });
    await expect(localFile(path.join(tmp, 'Projekty'))).rejects.toThrow(/not a regular file/);
});

test('mimeTypeOf knows Markdown and falls back to octet-stream', () => {
    expect(mimeTypeOf('notes.md')).toBe('text/markdown');
    expect(mimeTypeOf('a.csv')).toBe('text/csv');
    expect(mimeTypeOf('blob')).toBe('application/octet-stream');
});

test('resolveWritablePath writes into a directory under the sanitised Drive name, creating missing ones', async () => {
    expect(await resolveWritablePath({ input: `${tmp}/downloads/2026/`, defaultName: 'Umowa.pdf' })).toBe(
        path.join(tmp, 'downloads', '2026', 'Umowa.pdf'),
    );
    expect(await resolveWritablePath({ input: path.join(tmp, 'Projekty'), defaultName: '../a/b.docx' })).toBe(
        path.join(tmp, 'Projekty', '__a_b.docx'),
    );
    expect(await resolveWritablePath({ input: path.join(tmp, 'out', 'x.txt'), defaultName: 'ignored' })).toBe(
        path.join(tmp, 'out', 'x.txt'),
    );
});

test('resolveWritablePath does not replace a file unless asked', async () => {
    const input = path.join(tmp, 'raport.pdf');
    await expect(resolveWritablePath({ input, defaultName: 'x' })).rejects.toThrow(/already exists/);
    expect(await resolveWritablePath({ input, defaultName: 'x', overwrite: true })).toBe(input);
});
