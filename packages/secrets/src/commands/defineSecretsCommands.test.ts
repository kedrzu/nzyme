import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { SecretsMapping } from '../SecretsMapping.js';
import type { SecretStore, SecretStoreEntry } from '../SecretStore.js';
import { SENTINEL as RUN_SENTINEL } from './__fixtures__/secretsCli.js';
import { defineSecretsCommands } from './defineSecretsCommands.js';

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
    KEPT: process.env.KEPT,
    argv: process.argv,
}))`;

test('run passes every mapped secret via env, strips the store’s credentials, and keeps stdout the child’s', async () => {
    const result = await runFixtureCli(['secrets', 'run', '--', process.execPath, '-e', PRINT_ENV, 'arg'], {
        BW_TOKEN: 'bw-credential',
        BW_ORGANIZATION: 'bw-organization',
        KEPT: 'kept',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const child = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(child).toMatchObject({
        API_KEY: RUN_SENTINEL,
        DB_PASSWORD: 'db-pass',
        SMTP_PASSWORD: 'smtp-pass',
        BW_TOKEN: null,
        BW_ORGANIZATION: null,
        KEPT: 'kept',
    });
    expect(JSON.stringify(child.argv)).not.toContain(RUN_SENTINEL);
    expect(JSON.stringify(child.argv)).toContain('arg');
});

test('run lets a variable set in the environment win and reports it on stderr only', async () => {
    const result = await runFixtureCli(['secrets', 'run', '--', process.execPath, '-e', PRINT_ENV], {
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
    const result = await runFixtureCli(['secrets', 'run', '--', process.execPath, '-e', script]);

    expect(result.exitCode).toBe(expected);
    expect(result.stdout).toBe('');
});

test('run starts nothing when a secret is missing and names it on stderr', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-run-'));
    const marker = path.join(dir, 'started');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`;

    const result = await runFixtureCli(['secrets', 'run', '--', process.execPath, '-e', script], {
        FIXTURE_MISSING: '1',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('MISSING_ONE');
    expect(result.stderr).not.toContain(RUN_SENTINEL);
    expect(await Bun.file(marker).exists()).toBe(false);
});

// --- set ---

test('set writes the stdin value, minus one trailing newline, to the mapped key, and never prints it', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const mapping: SecretsMapping = {
        store: bw.store,
        secrets: { TELEGRAM_TOKEN: 'TELEGRAM_TOKEN_UMBRA', API_KEY: 'API_KEY' },
    };

    const first = await runCommand({ mapping, args: ['secrets', 'set', 'TELEGRAM_TOKEN'], stdin: `${SENTINEL}\n\n` });
    const second = await runCommand({ mapping, args: ['secrets', 'set', 'API_KEY'], stdin: 'api-value' });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(bw.writes).toEqual([
        [{ key: 'TELEGRAM_TOKEN_UMBRA', value: `${SENTINEL}\n` }],
        [{ key: 'API_KEY', value: 'api-value' }],
    ]);
    expectNoLeak(first, SENTINEL);
    expectNoLeak(second, 'api-value');
});

test('set of an unmapped name fails naming it and writes nothing', async () => {
    const bw = createMemoryStore({ id: 'bw' });

    const result = await runCommand({
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'set', 'NOT_MAPPED'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('NOT_MAPPED');
    expect(bw.writes).toEqual([]);
});

test('set refuses an empty value and a value given as an argument', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const mapping: SecretsMapping = { store: bw.store, secrets: { API_KEY: 'API_KEY' } };

    const empty = await runCommand({ mapping, args: ['secrets', 'set', 'API_KEY'], stdin: '\n' });
    const argument = await runCommand({ mapping, args: ['secrets', 'set', 'API_KEY', SENTINEL], stdin: 'from-stdin' });

    expect(empty.exitCode).toBe(1);
    expect(argument.exitCode).toBe(1);
    expect(bw.writes).toEqual([]);
});

// --- set --prompt (stand-ins for the dialog tools on PATH) ---

test('set --prompt writes the trimmed dialog value, ignores stdin, and prints only name, key, store and length', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const mapping: SecretsMapping = {
        store: bw.store,
        secrets: { TELEGRAM_TOKEN: 'TELEGRAM_TOKEN_UMBRA' },
    };
    await standInDialog(`  ${SENTINEL}  \n`);

    const result = await runCommand({
        mapping,
        args: ['secrets', 'set', 'TELEGRAM_TOKEN', '--prompt'],
        stdin: 'piped-value\n',
    });

    expect(result.exitCode).toBe(0);
    expect(bw.writes).toEqual([[{ key: 'TELEGRAM_TOKEN_UMBRA', value: SENTINEL }]]);
    expect(result.stdout).toBe(
        `TELEGRAM_TOKEN written to key TELEGRAM_TOKEN_UMBRA in store bw (${SENTINEL.length} characters).\n`,
    );
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'piped-value');
});

test('set --no-prompt reads the value from stdin and opens no dialog', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog('dialog-value');

    const result = await runCommand({
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
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
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'set', 'API_KEY', `--prompt=${hint}`],
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(dialogDir, 'dialog.argv'), 'utf8')).toContain(hint);
});

test('set --prompt refuses a multi-line value without printing it and writes nothing', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(`${SENTINEL}\nsecond-line-value\n`);

    const result = await runCommand({
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
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
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
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
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'set', 'API_KEY', '--prompt'],
        stdin: SENTINEL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('nzyme secrets set API_KEY`');
    expect(bw.writes).toEqual([]);
    expectNoLeak(result, SENTINEL);
});

test('set --prompt of an unmapped name fails naming it before opening a dialog', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    await standInDialog(SENTINEL);

    const result = await runCommand({
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'set', 'NOT_MAPPED', '--prompt'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('NOT_MAPPED');
    expect(await Bun.file(path.join(dialogDir, 'dialog.argv')).exists()).toBe(false);
    expect(bw.writes).toEqual([]);
});

// --- list ---

test('list shows each name’s store, key and status, never a value, and fails when any is missing', async () => {
    const bw = createMemoryStore({ id: 'bw', data: { API_KEY: SENTINEL, DB: 'db-value' } });
    const mapping: SecretsMapping = {
        store: bw.store,
        secrets: { API_KEY: 'API_KEY', DB_PASSWORD: 'DB', GONE: 'GONE' },
    };

    const result = await runCommand({ mapping, args: ['secrets', 'list'], env: { DB_PASSWORD: 'env-value' } });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(
        [
            'API_KEY  bw:API_KEY  resolves',
            'DB_PASSWORD  bw:DB  overridden by environment',
            'GONE  bw:GONE  missing',
            '',
        ].join('\n'),
    );
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'env-value');
});

test('list exits 0 when every secret resolves', async () => {
    const bw = createMemoryStore({ id: 'bw', data: { API_KEY: SENTINEL } });

    const result = await runCommand({
        mapping: { store: bw.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'list'],
    });

    expect(result.exitCode).toBe(0);
    expectNoLeak(result, SENTINEL);
});

// --- login ---

test('login prompts once through stdin and calls the store’s login with the answer', async () => {
    const bw = createMemoryStore({ id: 'bw', login: true });
    const mapping: SecretsMapping = { store: bw.store, secrets: {} };

    const result = await runCommand({ mapping, args: ['secrets', 'login'], stdin: `${SENTINEL}\n` });

    expect(result.exitCode).toBe(0);
    expect(bw.logins).toEqual([SENTINEL]);
    expectNoLeak(result, SENTINEL);
});

test('login with an empty answer fails saying nothing was entered and never reaches the store', async () => {
    const bw = createMemoryStore({ id: 'bw', login: true });
    const mapping: SecretsMapping = { store: bw.store, secrets: {} };

    const result = await runCommand({ mapping, args: ['secrets', 'login'], stdin: ' \n' });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Nothing was entered');
    expect(bw.logins).toEqual([]);
});

test('login fails naming a store without login', async () => {
    const plain = createMemoryStore({ id: 'plain' });

    const result = await runCommand({ mapping: { store: plain.store, secrets: {} }, args: ['secrets', 'login'] });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Store plain has no login');
});

// --- refresh ---

test('refresh calls the store’s refresh with every mapped key once', async () => {
    const bw = createMemoryStore({ id: 'bw', refresh: true });
    const mapping: SecretsMapping = {
        store: bw.store,
        secrets: { API_KEY: 'API_KEY', TOKEN: 'TOKEN_KEY', LEGACY_TOKEN: 'TOKEN_KEY' },
    };

    const result = await runCommand({ mapping, args: ['secrets', 'refresh'] });

    expect(result.exitCode).toBe(0);
    expect(bw.refreshes).toEqual([['API_KEY', 'TOKEN_KEY']]);
    expect(result.stdout).toBe('Refreshed store bw.\n');
});

test('refresh leaves a store without a cache alone', async () => {
    const plain = createMemoryStore({ id: 'plain' });

    const result = await runCommand({
        mapping: { store: plain.store, secrets: { API_KEY: 'API_KEY' } },
        args: ['secrets', 'refresh'],
    });

    expect(result.exitCode).toBe(0);
    expect(plain.reads).toEqual([]);
});

interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    errors: string;
}

interface RunCommandOptions {
    mapping: SecretsMapping;
    args: string[];
    stdin?: string;
    env?: EnvVariables;
}

/** Runs a `secrets` command through clipanion in-process, with a real container and the given mapping. */
async function runCommand(options: RunCommandOptions) {
    const { mapping, args } = options;
    const provider = defineService<SecretsMapping>({ name: 'AppSecrets', setup: () => mapping });
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

interface MemoryStoreOptions {
    id: string;
    data?: Record<string, string>;
    credentialEnv?: string[];
    login?: boolean;
    refresh?: boolean;
}

function createMemoryStore(options: MemoryStoreOptions) {
    const data = new Map(Object.entries(options.data ?? {}));
    const reads: string[][] = [];
    const writes: SecretStoreEntry[][] = [];
    const logins: string[] = [];
    const refreshes: string[][] = [];

    const store: SecretStore = {
        id: options.id,
        credentialEnv: options.credentialEnv,
        read(keys) {
            reads.push(keys);
            const found = new Map<string, string>();
            for (const key of keys) {
                const value = data.get(key);
                if (value !== undefined) {
                    found.set(key, value);
                }
            }

            return Promise.resolve(found);
        },
        write(entries) {
            writes.push(entries);
            return Promise.resolve();
        },
    };

    if (options.login) {
        store.login = async prompt => {
            logins.push(await prompt('Access token'));
        };
    }

    if (options.refresh) {
        store.refresh = keys => {
            refreshes.push(keys);
            return Promise.resolve();
        };
    }

    return { store, reads, writes, logins, refreshes };
}
