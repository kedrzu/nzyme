import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeProjectSettings } from './writeProjectSettings.js';

let workDir: string;

beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-project-settings-'));
});

afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
});

test('replaces the file instead of rewriting it, so a reader that already opened it keeps complete content', async () => {
    const filePath = path.join(workDir, 'Pulumi.yaml');
    const previous = 'name: previous\nruntime: nodejs\n';
    await fs.writeFile(filePath, previous);
    const reader = await fs.open(filePath, 'r');

    try {
        await writeProjectSettings(workDir, 'next');

        // An in-place write (truncate, then write) would change what this open handle reads.
        const { buffer, bytesRead } = await reader.read(Buffer.alloc(previous.length * 2), 0, previous.length * 2, 0);
        expect(buffer.subarray(0, bytesRead).toString()).toBe(previous);
    } finally {
        await reader.close();
    }
});

test('writes project settings Pulumi can read and leaves no temp file behind', async () => {
    await writeProjectSettings(workDir, 'my-project');

    expect(await fs.readdir(workDir)).toEqual(['Pulumi.yaml']);
    const contents = await fs.readFile(path.join(workDir, 'Pulumi.yaml'), 'utf8');
    expect(Bun.YAML.parse(contents)).toEqual({ name: 'my-project', runtime: 'nodejs' });
});
