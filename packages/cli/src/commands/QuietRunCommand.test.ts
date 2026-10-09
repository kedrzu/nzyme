import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

test('prints one line for a succeeding command and keeps its output in the log', async () => {
    const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-run-'));

    const result = await runQuietRun(logDir, [
        process.execPath,
        '-e',
        'console.log(["hello", "from the child"].join(" "))',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^✓ passed · .+ · 1 lines · \d+s · full log: .+\.log\n$/);
    expect(result.stdout).not.toContain('hello from the child');

    const logFiles = (await fs.readdir(logDir)).filter(file => file.endsWith('.log'));
    expect(logFiles).toHaveLength(1);
    expect(await fs.readFile(path.join(logDir, String(logFiles[0])), 'utf8')).toBe('hello from the child\n');
});

test('reports a failing command with its error lines and passes its exit code through', async () => {
    const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-run-'));
    const script = 'console.log("step one"); console.error("error: it broke"); process.exit(3)';

    const result = await runQuietRun(logDir, [process.execPath, '-e', script]);

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toMatch(/^✗ FAILED \(exit 3\) · /);
    expect(result.stdout).toContain('--- error-signature lines (grep) ---\n2:error: it broke\n');
    expect(result.stdout).toContain('--- last 30 lines ---\nstep one\nerror: it broke\n');
    expect(result.stdout).toContain('(read selectively; do not re-dump it whole)');
});

test('reports a command that cannot be found with the shell exit code', async () => {
    const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-run-'));

    const result = await runQuietRun(logDir, ['nzyme-quiet-run-no-such-command']);

    expect(result.exitCode).toBe(127);
    expect(result.stdout).toMatch(/^✗ FAILED \(exit 127\) · /);
});

async function runQuietRun(logDir: string, command: string[]) {
    // The CLI resolves the project root on start-up, so it has to run inside a project.
    await fs.writeFile(path.join(logDir, 'package.json'), '{ "name": "fixture" }');

    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'quiet-run', ...command], {
        cwd: logDir,
        env: { ...process.env, QUIET_RUN_LOGDIR: logDir },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return { stdout, exitCode };
}
