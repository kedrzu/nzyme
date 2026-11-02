import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;
const CLI_CORE_PATH = new URL('../../../cli-core', import.meta.url).pathname;

const WORKING_PLUGIN = `
import { Command } from '@nzyme/cli-core/Command.js';
import { Option } from '@nzyme/cli-core';

class HelloCommand extends Command {
    static paths = [['hello']];
    static usage = { description: 'Says hello' };
    name = Option.String('--name', 'world');
    run() {
        process.stdout.write('hello ' + this.name + '\\n');
    }
}

export default { commands: [HelloCommand] };
`;

const THROWING_PLUGIN = `
throw new Error('plugin blew up');
`;

test('a repo plugin adds a runnable command, listed in --help', async () => {
    const repo = await createRepo({ 'plugin.ts': WORKING_PLUGIN }, ['./plugin.ts']);

    const run = await runCli(repo, ['hello', '--name', 'nzyme']);
    expect(run).toEqual({ exitCode: 0, stdout: 'hello nzyme\n', stderr: '' });

    const help = await runCli(repo, ['--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('Says hello');
});

test('plugin paths resolve against the project root, not the cwd', async () => {
    const repo = await createRepo({ 'tools/plugin.ts': WORKING_PLUGIN }, ['./tools/plugin.ts']);
    await fs.mkdir(path.join(repo, 'packages/a'), { recursive: true });

    const result = await runCli(path.join(repo, 'packages/a'), ['hello']);

    expect(result).toEqual({ exitCode: 0, stdout: 'hello world\n', stderr: '' });
});

test('a plugin command may start with the first word of a built-in', async () => {
    const source = WORKING_PLUGIN.replace("[['hello']]", "[['index', 'rebuild']]");
    const repo = await createRepo({ 'plugin.ts': source }, ['./plugin.ts']);

    const result = await runCli(repo, ['index', 'rebuild']);

    expect(result).toEqual({ exitCode: 0, stdout: 'hello world\n', stderr: '' });
});

test.each([[['index']], [['--help']], [[]]])('a broken plugin fails %j', async args => {
    const repo = await createRepo({ 'plugin.ts': THROWING_PLUGIN }, ['./plugin.ts']);

    const result = await runCli(repo, args);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cannot load the nzyme plugin ./plugin.ts: plugin blew up');
});

test.each([
    ['throws on import', THROWING_PLUGIN, 'plugin blew up'],
    ['has no default export', 'export const commands = [];', 'default-export'],
    ['has no commands array', 'export default { commands: "hello" };', 'default-export'],
    ['lists a non-command', 'export default { commands: [{}] };', 'default-export'],
])('the CLI fails when a plugin %s', async (_name, source, cause) => {
    const repo = await createRepo({ 'plugin.ts': source }, ['./plugin.ts']);

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('./plugin.ts');
    expect(result.stderr).toContain(cause);
});

test('the CLI fails with the path when a plugin file is missing', async () => {
    const repo = await createRepo({}, ['./missing.ts']);

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('./missing.ts');
    expect(result.stderr).toContain('Cannot find module');
});

test('a malformed nzyme.plugins fails the CLI', async () => {
    const repo = await createRepo({});
    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'r', nzyme: { plugins: './a.ts' } }));

    const result = await runCli(repo, ['--help']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('`nzyme.plugins` must be an array of paths');
});

test('a repo with no plugins keeps the unknown-command behaviour', async () => {
    const repo = await createRepo({});

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Command not found');
    expect(result.stderr).toBe('');
});

test('a command named secrets gets no .env loading from nzyme', async () => {
    const source = WORKING_PLUGIN.replace("[['hello']]", "[['secrets']]");
    const repo = await createRepo({ 'plugin.ts': source, '.env': 'A=1\n' }, ['./plugin.ts']);

    const result = await runCli(repo, ['secrets']);

    expect(result).toEqual({ exitCode: 0, stdout: 'hello world\n', stderr: '' });
});

async function createRepo(files: Record<string, string>, plugins?: string[]) {
    const repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nzyme-plugins-')));
    const manifest = { name: 'scratch', ...(plugins ? { nzyme: { plugins } } : {}) };
    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify(manifest));

    for (const [file, content] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
        await fs.writeFile(path.join(repo, file), content);
    }

    await fs.mkdir(path.join(repo, 'node_modules/@nzyme'), { recursive: true });
    await fs.symlink(CLI_CORE_PATH, path.join(repo, 'node_modules/@nzyme/cli-core'));
    return repo;
}

async function runCli(cwd: string, args: string[], env: Record<string, string> = {}) {
    const proc = Bun.spawn([process.execPath, CLI_PATH, ...args], {
        cwd,
        env: { ...process.env, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return { exitCode, stdout, stderr };
}
