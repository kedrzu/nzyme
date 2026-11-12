import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { spawnForExitCode } from './spawnForExitCode.js';

const MODULE_PATH = new URL('./spawnForExitCode.ts', import.meta.url).pathname;

/**
 * A command that says it is ready once it can handle SIGTERM, and exits with 7 when it gets one. It
 * gives up on its own, so a wrapper that dies first does not leave it running after the test.
 */
const CHILD_SCRIPT = `
process.on('SIGTERM', () => process.exit(7));
console.log('ready');
setTimeout(() => process.exit(1), 5000);
`;

/** A wrapper that runs the command and exits with the exit code {@link spawnForExitCode} resolves. */
const WRAPPER_SCRIPT = `
const { spawnForExitCode } = await import(${JSON.stringify(MODULE_PATH)});
const { exitCode } = await spawnForExitCode({
    executable: process.execPath,
    args: ['-e', ${JSON.stringify(CHILD_SCRIPT)}],
    stdio: 'inherit',
});
process.exit(exitCode);
`;

test('outlives SIGINT and forwards SIGTERM to the command, exiting with its code', async () => {
    const wrapper = Bun.spawn([process.execPath, '-e', WRAPPER_SCRIPT], { stdout: 'pipe', stderr: 'inherit' });

    const reader = wrapper.stdout.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain('ready');

    // Sent to the wrapper alone, as a process manager or `kill` would: the command sees only what
    // the wrapper forwards.
    wrapper.kill('SIGINT');
    wrapper.kill('SIGTERM');

    expect(await wrapper.exited).toBe(7);
});

test('runs the command in the given working directory', async () => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spawn-cwd-')));
    const output = path.join(dir, 'cwd.txt');

    const { exitCode } = await spawnForExitCode({
        executable: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(output)}, process.cwd())`],
        stdio: 'inherit',
        cwd: dir,
    });

    expect(exitCode).toBe(0);
    expect(await fs.readFile(output, 'utf8')).toBe(dir);
    await fs.rm(dir, { recursive: true, force: true });
});
