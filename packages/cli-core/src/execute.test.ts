import path from 'node:path';

import { expect, test } from 'bun:test';

const FIXTURE = path.join(import.meta.dir, '__fixtures__', 'fixtureCli.ts');

test('a command line that does not parse fails on stderr and leaves stdout empty', async () => {
    const result = await runFixture(['--bogus']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unsupported option name ("--bogus")');
});

test('a command line that parses runs the command', async () => {
    const result = await runFixture(['--name', 'flaneur']);

    expect(result).toEqual({ exitCode: 0, stdout: 'flaneur\n', stderr: '' });
});

test('--version prints the version given to execute', async () => {
    const result = await runFixture(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('1.2.3');
});

async function runFixture(args: string[]) {
    const child = Bun.spawn([process.execPath, FIXTURE, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { exitCode, stdout, stderr };
}
