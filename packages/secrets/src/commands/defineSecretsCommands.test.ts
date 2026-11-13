import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Cli } from 'clipanion';

import { UsageError } from '@nzyme/cli-core';
import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';

import { createMemoryStore } from '../__fixtures__/createMemoryStore.js';
import type { SecretStore } from '../SecretStore.js';
import { SENTINEL as RUN_SENTINEL } from './__fixtures__/secretsCli.js';
import { defineSecretsCommands } from './defineSecretsCommands.js';
import type { SecretsProvider } from './SecretsCommandsOptions.js';

const SENTINEL = 'sentinel-secret-value-cmd-81e0';
const FIXTURE_CLI = new URL('./__fixtures__/secretsCli.ts', import.meta.url).pathname;

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/** What the base `Command.catch` printed through `console.error`, joined. */
let errors = '';
let exitCodes: (number | string | null | undefined)[] = [];
/** The temp dir `set --prompt` tests put on PATH; empty when the test uses none. */
let dialogDir = '';
const ORIGINAL_PATH = process.env.PATH;
const ORIGINAL_DISPLAY = process.env.DISPLAY;
const spies: { mockRestore: () => void }[] = [];

beforeEach(() => {
    errors = '';
    exitCodes = [];
    spies.push(
        // Recorded, not performed: the base `Command.catch` exits 1 after reporting an error.
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited();
        }),
        spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors += args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
        }),
    );
});

afterEach(async () => {
    for (const spy of spies) {
        spy.mockRestore();
    }

    spies.length = 0;
    restoreEnv('PATH', ORIGINAL_PATH);
    restoreEnv('DISPLAY', ORIGINAL_DISPLAY);
    if (dialogDir) {
        await fs.rm(dialogDir, { recursive: true, force: true });
        dialogDir = '';
    }
});

// --- run (a real process, real stdio) ---

const PRINT_ENV = `process.stdout.write(JSON.stringify({
    API_KEY: process.env.API_KEY,
    DB_PASSWORD: process.env.DB_PASSWORD,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    BW_TOKEN: process.env.BW_TOKEN ?? null,
    BW_ORGANIZATION: process.env.BW_ORGANIZATION ?? null,
    EXTRA_TOKEN: process.env.EXTRA_TOKEN ?? null,
    KEPT: process.env.KEPT,
    argv: process.argv,
}))`;

const ALL_KEYS = ['API_KEY', 'DB_PASSWORD', 'SMTP_PASSWORD'];

test('run puts the named secrets (earlier store wins) into the env, strips every store’s credentials, and keeps stdout the child’s', async () => {
    const result = await runFixtureCli(
        ['secrets', 'run', ...ALL_KEYS, '--', process.execPath, '-e', PRINT_ENV, 'arg'],
        {
            BW_TOKEN: 'bw-credential',
            BW_ORGANIZATION: 'bw-organization',
            EXTRA_TOKEN: 'extra-credential',
            KEPT: 'kept',
        },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const child = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(child).toMatchObject({
        API_KEY: RUN_SENTINEL,
        DB_PASSWORD: 'db-pass',
        SMTP_PASSWORD: 'smtp-pass',
        BW_TOKEN: null,
        BW_ORGANIZATION: null,
        EXTRA_TOKEN: null,
        KEPT: 'kept',
    });
    expect(JSON.stringify(child.argv)).not.toContain(RUN_SENTINEL);
    expect(JSON.stringify(child.argv)).toContain('arg');
});

test('run lets a variable set in the environment win and reports it on stderr only', async () => {
    const result = await runFixtureCli(['secrets', 'run', ...ALL_KEYS, '--', process.execPath, '-e', PRINT_ENV], {
        DB_PASSWORD: 'from-env',
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ DB_PASSWORD: 'from-env', API_KEY: RUN_SENTINEL });
    expect(result.stderr).toContain('DB_PASSWORD');
    expect(result.stderr).not.toContain('from-env');
    expect(result.stderr).not.toContain(RUN_SENTINEL);
});

test.each([
    ['an exit code', 'process.exit(7)', 7],
    ['a signal as 128 + its number', 'process.kill(process.pid, "SIGTERM")', 128 + os.constants.signals.SIGTERM],
])('run passes %s through', async (_, script, expected) => {
    const result = await runFixtureCli(['secrets', 'run', 'API_KEY', '--', process.execPath, '-e', script]);

    expect(result.exitCode).toBe(expected);
    expect(result.stdout).toBe('');
});

test('run starts nothing when a store cannot be read and prints no value', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-run-'));
    const marker = path.join(dir, 'started');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`;

    const result = await runFixtureCli(['secrets', 'run', 'API_KEY', '--', process.execPath, '-e', script], {
        FIXTURE_UNREADABLE: '1',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain(RUN_SENTINEL);
    expect(await Bun.file(marker).exists()).toBe(false);
});

test('run gives the command only the secrets it names', async () => {
    const result = await runFixtureCli(['secrets', 'run', 'DB_PASSWORD', '--', process.execPath, '-e', PRINT_ENV]);

    expect(result.exitCode).toBe(0);
    const child = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(child.DB_PASSWORD).toBe('db-pass');
    expect(child.API_KEY).toBeUndefined();
    expect(child.SMTP_PASSWORD).toBeUndefined();
});

test('run starts nothing when a named secret is in no store, and names it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-run-'));
    const marker = path.join(dir, 'started');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`;

    const result = await runFixtureCli([
        'secrets',
        'run',
        'API_KEY',
        'NOT_STORED',
        '--',
        process.execPath,
        '-e',
        script,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('NOT_STORED');
    expect(result.stderr).not.toContain(RUN_SENTINEL);
    expect(await Bun.file(marker).exists()).toBe(false);
});

test.each([
    ['no secret is named', ['--', process.execPath, '-e', '']],
    ['there is no separator', ['API_KEY', process.execPath, '-e', '']],
    ['there is no command', ['API_KEY', '--']],
])('run is a usage error when %s', async (_, args) => {
    const result = await runFixtureCli(['secrets', 'run', ...args]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('secrets run <KEY>... -- <command>');
});

// --- set ---

test('set writes the stdin value, minus one trailing newline, under the key of the target store, and never prints it', async () => {
    const bw = createMemoryStore({ id: 'bw' });

    const first = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'TELEGRAM_TOKEN'],
        stdin: `${SENTINEL}\n\n`,
    });
    const second = await runCommand({ stores: [bw.store], args: ['secrets', 'set', 'API_KEY'], stdin: 'api-value' });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(bw.writes).toEqual([
        [{ key: 'TELEGRAM_TOKEN', value: `${SENTINEL}\n` }],
        [{ key: 'API_KEY', value: 'api-value' }],
    ]);
    expectNoLeak(first, SENTINEL);
    expectNoLeak(second, 'api-value');
});

test('set writes to the store target picks, and to no other', async () => {
    const dev = createMemoryStore({ id: 'dev' });
    const shared = createMemoryStore({ id: 'shared' });

    const result = await runCommand({
        stores: [dev.store, shared.store],
        target: name => (name.startsWith('SHARED_') ? shared.store : dev.store),
        args: ['secrets', 'set', 'SHARED_KEY'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(0);
    expect(shared.writes).toEqual([[{ key: 'SHARED_KEY', value: SENTINEL }]]);
    expect(dev.writes).toEqual([]);
    expect(result.stdout).toBe('SHARED_KEY written to store shared.\n');
});

test('set of a name target refuses fails with its message and writes to no store', async () => {
    const dev = createMemoryStore({ id: 'dev' });
    const shared = createMemoryStore({ id: 'shared' });

    const result = await runCommand({
        stores: [dev.store, shared.store],
        target: name => {
            throw new UsageError(`${name} is not a secret.`);
        },
        args: ['secrets', 'set', 'NOT_A_SECRET'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('NOT_A_SECRET is not a secret.');
    expect(dev.writes).toEqual([]);
    expect(shared.writes).toEqual([]);
    expectNoLeak(result, SENTINEL);
});

test('set refuses an empty value and a value given as an argument', async () => {
    const bw = createMemoryStore({ id: 'bw' });

    const empty = await runCommand({ stores: [bw.store], args: ['secrets', 'set', 'API_KEY'], stdin: '\n' });
    const argument = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', SENTINEL],
        stdin: 'from-stdin',
    });

    expect(empty.exitCode).toBe(1);
    expect(argument.exitCode).toBe(1);
    expect(bw.writes).toEqual([]);
});

// --- set --prompt (stand-ins for the dialog tools on PATH) ---

test('set --prompt writes the trimmed dialog value, ignores stdin, and prints only name, store and length', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(`  ${SENTINEL}  \n`);

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'TELEGRAM_TOKEN', '--prompt'],
        stdin: 'piped-value\n',
    });

    expect(result.exitCode).toBe(0);
    expect(bw.writes).toEqual([[{ key: 'TELEGRAM_TOKEN', value: SENTINEL }]]);
    expect(result.stdout).toBe(`TELEGRAM_TOKEN written to store bw (${SENTINEL.length} characters).\n`);
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'piped-value');
});

test('set --no-prompt reads the value from stdin and opens no dialog', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog('dialog-value');

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', '--no-prompt'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(0);
    expect(bw.writes).toEqual([[{ key: 'API_KEY', value: SENTINEL }]]);
    expectNoLeak(result, SENTINEL);
});

test('set --prompt=<hint> shows the hint in the dialog', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const hint = 'Settings → API → the live key';
    await standInDialog(SENTINEL);

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', `--prompt=${hint}`],
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(dialogDir, 'dialog.argv'), 'utf8')).toContain(hint);
});

test('set --prompt refuses a multi-line value without printing it and writes nothing', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(`${SENTINEL}\nsecond-line-value\n`);

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', '--prompt'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('several lines');
    expect(bw.writes).toEqual([]);
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'second-line-value');
});

test.each([
    ['cancelled', ''],
    ['blank', '   \n'],
])('set --prompt with a %s dialog fails saying nothing was entered and writes nothing', async (_, answer) => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(answer);

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', '--prompt'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Nothing was entered for API_KEY');
    expect(bw.writes).toEqual([]);
    expectNoLeak(result, SENTINEL);
});

test('set --prompt with no dialog tool and no terminal fails naming the command for the user to run', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    // A PATH with no dialog tool on it; stdin is a stream, not a terminal.
    await useDialogDir();

    const result = await runCommand({
        stores: [bw.store],
        args: ['secrets', 'set', 'API_KEY', '--prompt'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('nzyme secrets set API_KEY`');
    expect(bw.writes).toEqual([]);
    expectNoLeak(result, SENTINEL);
});

test('set --prompt of a refused name fails before opening a dialog', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(SENTINEL);

    const result = await runCommand({
        stores: [bw.store],
        target: name => {
            throw new UsageError(`${name} is not a secret.`);
        },
        args: ['secrets', 'set', 'NOT_A_SECRET', '--prompt'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('NOT_A_SECRET');
    expect(await Bun.file(path.join(dialogDir, 'dialog.argv')).exists()).toBe(false);
    expect(bw.writes).toEqual([]);
});

// --- list ---

test('list shows every key of every store with its store id, never a value', async () => {
    const one = createMemoryStore({ id: 'one', data: { API_KEY: SENTINEL, DB: 'db-value' } });
    const two = createMemoryStore({ id: 'two', data: { SMTP: 'smtp-value' } });

    const result = await runCommand({
        stores: [one.store, two.store],
        args: ['secrets', 'list'],
        env: { DB: 'env-value' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(['API_KEY  one', 'DB  one  overridden by environment', 'SMTP  two', ''].join('\n'));
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'db-value');
    expectNoLeak(result, 'smtp-value');
    expectNoLeak(result, 'env-value');
});

// --- login ---

test('login prompts once per store through stdin and passes the answer to the store’s login', async () => {
    const bw = createMemoryStore({ id: 'bw', login: true });
    const plain = createMemoryStore({ id: 'plain' });

    const result = await runCommand({
        stores: [plain.store, bw.store],
        args: ['secrets', 'login'],
        stdin: `${SENTINEL}\n`,
    });

    expect(result.exitCode).toBe(0);
    expect(bw.logins).toEqual([SENTINEL]);
    expect(result.stdout).toBe('Logged in to store bw.\n');
    expectNoLeak(result, SENTINEL);
});

test('login with an empty answer fails saying nothing was entered and never reaches the store', async () => {
    const bw = createMemoryStore({ id: 'bw', login: true });

    const result = await runCommand({ stores: [bw.store], args: ['secrets', 'login'], stdin: ' \n' });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Nothing was entered');
    expect(bw.logins).toEqual([]);
});

test('login fails when no store has a login', async () => {
    const plain = createMemoryStore({ id: 'plain' });

    const result = await runCommand({ stores: [plain.store], args: ['secrets', 'login'] });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('None of the stores has a login');
});

// --- refresh ---

test('refresh calls refresh on every store that has one and leaves the others alone', async () => {
    const bw = createMemoryStore({ id: 'bw', refresh: true });
    const plain = createMemoryStore({ id: 'plain' });

    const result = await runCommand({ stores: [bw.store, plain.store], args: ['secrets', 'refresh'] });

    expect(result.exitCode).toBe(0);
    expect(bw.refreshes).toBe(1);
    expect(plain.reads).toBe(0);
    expect(result.stdout).toBe('Refreshed store bw.\nStore plain keeps no cache; nothing to refresh.\n');
});

interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    errors: string;
}

interface RunCommandOptions {
    stores: SecretStore[];
    /** The write policy; the first store by default. */
    target?: SecretsProvider['target'];
    args: string[];
    stdin?: string;
    env?: EnvVariables;
}

/** Runs a `secrets` command through clipanion in-process, with a real container and the given stores. */
async function runCommand(options: RunCommandOptions) {
    const { stores, args } = options;
    const target =
        options.target ??
        (() => {
            const [first] = stores;
            if (!first) {
                throw new Error('The test gave no store');
            }

            return first;
        });
    const provider = defineService<SecretsProvider>({ name: 'AppSecrets', setup: () => ({ stores, target }) });
    const cli = new Cli<CommandContext>({ binaryName: 'nzyme' });
    for (const command of defineSecretsCommands({ provider })) {
        cli.register(command);
    }

    const container = createContainer();
    container.set(EnvVariables, options.env ?? {});
    const stdout = collect();
    const stderr = collect();
    errors = '';
    exitCodes = [];

    const code = await cli.run(args, {
        container,
        stdin: Readable.from([options.stdin ?? '']),
        stdout: stdout.stream,
        stderr: stderr.stream,
    });

    const exited = exitCodes[0];
    const result: CommandResult = {
        exitCode: typeof exited === 'number' ? exited : code,
        stdout: stdout.text(),
        stderr: stderr.text(),
        errors,
    };

    return result;
}

/** Runs the fixture CLI as a real process, so `secrets run` is observed on real stdio. */
async function runFixtureCli(args: string[], env: Record<string, string> = {}) {
    const child = Bun.spawn([process.execPath, '--conditions=source', FIXTURE_CLI, ...args], {
        env: { ...process.env, ...env },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);

    return { stdout, stderr, exitCode };
}

/**
 * Puts a fresh temp dir alone on PATH, with DISPLAY set, so `promptSecret` finds only stand-ins
 * placed there — never the host's real dialog tools — on macOS and Linux hosts alike.
 */
async function useDialogDir() {
    dialogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-set-prompt-'));
    process.env.PATH = dialogDir;
    process.env.DISPLAY = ':0';
}

/**
 * Writes `osascript` and `zenity` stand-ins that record their argv to `dialog.argv`
 * and answer `answer`, as a dialog the user typed it into. Other programs are called by absolute path.
 */
async function standInDialog(answer: string) {
    await useDialogDir();
    const out = path.join(dialogDir, 'dialog.out');
    await fs.writeFile(out, answer);
    const script = [
        '#!/bin/sh',
        `printf '%s\\0' "$@" > '${path.join(dialogDir, 'dialog.argv')}'`,
        `/bin/cat > /dev/null`,
        `/bin/cat '${out}'`,
    ].join('\n');
    for (const tool of ['osascript', 'zenity']) {
        await fs.writeFile(path.join(dialogDir, tool), script, { mode: 0o755 });
    }
}

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

function expectNoLeak(result: CommandResult, value: string) {
    expect(result.stdout).not.toContain(value);
    expect(result.stderr).not.toContain(value);
    expect(result.errors).not.toContain(value);
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
