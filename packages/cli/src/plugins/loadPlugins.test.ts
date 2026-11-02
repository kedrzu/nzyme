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
process.stdout.write('plugin was imported\\n');
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

test('a built-in command never imports a plugin', async () => {
    const repo = await createRepo({ 'plugin.ts': THROWING_PLUGIN }, ['./plugin.ts']);

    const result = await runCli(repo, ['quiet-run', process.execPath, '--version'], { QUIET_RUN_LOGDIR: 'logs' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^✓ passed · [^\n]+\n$/);
    expect(result.stderr).toBe('');
});

test('a built-in reached by its first path segment never imports a plugin', async () => {
    const repo = await createRepo({ 'plugin.ts': THROWING_PLUGIN }, ['./plugin.ts']);
    const clean = await createRepo({});

    const result = await runCli(repo, ['submodule', 'bump', '--help']);

    expect(result).toEqual(await runCli(clean, ['submodule', 'bump', '--help']));
});

test.each([[['--help']], [['--version']], [[]]])('%j warns about a broken plugin and carries on', async args => {
    const broken = await createRepo({ 'plugin.ts': THROWING_PLUGIN, 'good.ts': WORKING_PLUGIN }, [
        './plugin.ts',
        './good.ts',
    ]);
    const clean = await createRepo({ 'good.ts': WORKING_PLUGIN }, ['./good.ts']);

    const result = await runCli(broken, args);
    const expected = await runCli(clean, args);

    expect(result.exitCode).toBe(expected.exitCode);
    expect(result.stdout).toBe(`plugin was imported\n${expected.stdout}`);
    expect(result.stderr).toContain('./plugin.ts');
    expect(result.stderr).toContain('plugin blew up');
});

test.each([
    ['throws on import', THROWING_PLUGIN, 'plugin blew up'],
    ['has no default export', 'export const commands = [];', 'default-export'],
    ['has no commands array', 'export default { commands: "hello" };', 'default-export'],
    ['lists a non-command', 'export default { commands: [{}] };', 'default-export'],
])('running a command fails when a plugin %s', async (_name, source, cause) => {
    const repo = await createRepo({ 'plugin.ts': source }, ['./plugin.ts']);

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('./plugin.ts');
    expect(result.stderr).toContain(cause);
});

test('running a command fails with the path when a plugin file is missing', async () => {
    const repo = await createRepo({}, ['./missing.ts']);

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('./missing.ts');
    expect(result.stderr).toContain('Cannot find module');
});

test('a malformed nzyme.plugins is reported like a broken plugin', async () => {
    const repo = await createRepo({});
    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'r', nzyme: { plugins: './a.ts' } }));

    const command = await runCli(repo, ['hello']);
    const help = await runCli(repo, ['--help']);

    expect(command.exitCode).toBe(1);
    expect(command.stderr).toContain('`nzyme.plugins` must be an array of paths');
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toContain('`nzyme.plugins` must be an array of paths');
});

test('a plugin built on another copy of cli-core and clipanion names the fix', async () => {
    const repo = await createRepo({ 'plugin.ts': WORKING_PLUGIN }, ['./plugin.ts']);
    await installSecondCopy(repo);

    const result = await runCli(repo, ['hello']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('./plugin.ts');
    expect(result.stderr).toContain('use one version of `@nzyme/*`, installed in this repo');
    expect(result.stderr).not.toContain('Unsupported option name');
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

/** Gives the repo its own `@nzyme/cli-core` with its own clipanion, as a second install would. */
async function installSecondCopy(repo: string) {
    const copy = path.join(repo, 'node_modules/@nzyme/cli-core');
    await fs.rm(copy);
    await fs.mkdir(copy);
    await fs.cp(path.join(CLI_CORE_PATH, 'dist'), path.join(copy, 'dist'), { recursive: true });
    await fs.copyFile(path.join(CLI_CORE_PATH, 'package.json'), path.join(copy, 'package.json'));

    const modules = path.join(copy, 'node_modules');
    await fs.mkdir(path.join(modules, '@nzyme'), { recursive: true });
    for (const dep of ['ioc', 'logging', 'node-utils', 'utils']) {
        await fs.symlink(path.join(CLI_CORE_PATH, 'node_modules/@nzyme', dep), path.join(modules, '@nzyme', dep));
    }
    await fs.symlink(
        path.join(CLI_CORE_PATH, 'node_modules/source-map-support'),
        path.join(modules, 'source-map-support'),
    );

    const clipanion = await fs.realpath(path.join(CLI_CORE_PATH, 'node_modules/clipanion'));
    await fs.cp(clipanion, path.join(modules, 'clipanion'), { recursive: true });
    await fs.symlink(path.join(clipanion, '../typanion'), path.join(modules, 'typanion'));
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
