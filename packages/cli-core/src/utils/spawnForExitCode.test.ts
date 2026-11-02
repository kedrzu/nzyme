import { expect, test } from 'bun:test';

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
