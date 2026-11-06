import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

test('`machine status --json` keeps stdout to the JSON even in a project with a .env', async () => {
    // Loading a `.env` logs a line to stdout; `machine` commands must skip it, or a shell capturing
    // `machine reserve`'s worker count (or parsing this JSON) would read that line too.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'machine-status-'));
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "fixture" }');
    await fs.writeFile(path.join(projectDir, '.env'), 'NZYME_MACHINE_STATUS_FIXTURE=1\n');

    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'machine', 'status', '--json'], {
        cwd: projectDir,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    expect(exitCode).toBe(0);
    const status: unknown = JSON.parse(stdout);
    expect(status).toHaveProperty('totalBytes');
    expect(status).toHaveProperty('holders');
});
