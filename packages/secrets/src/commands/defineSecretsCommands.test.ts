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

import type { SecretsMapping } from '../SecretsProvider.js';
import { SecretsProvider } from '../SecretsProvider.js';
import type { SecretStore, SecretStoreDefinition, SecretStoreEntry, SecretStoreLoginContext } from '../SecretStore.js';
import { defineSecretStore } from '../SecretStore.js';
import { SENTINEL as RUN_SENTINEL } from './__fixtures__/secretsCli.js';
import { defineSecretsCommands } from './defineSecretsCommands.js';

const SENTINEL = 'sentinel-secret-value-cmd-81e0';
const FIXTURE_CLI = new URL('./__fixtures__/secretsCli.ts', import.meta.url).pathname;

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/** What the base `Command.catch` printed through `console.error`, joined. */
let errors = '';
let exitCodes: (number | string | null | undefined)[] = [];
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

afterEach(() => {
    for (const spy of spies) {
        spy.mockRestore();
    }

    spies.length = 0;
});

// --- run (a real process, real stdio) ---

const PRINT_ENV = `process.stdout.write(JSON.stringify({
    API_KEY: process.env.API_KEY,
    DB_PASSWORD: process.env.DB_PASSWORD,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    BW_TOKEN: process.env.BW_TOKEN ?? null,
    VAULT_TOKEN: process.env.VAULT_TOKEN ?? null,
    KEPT: process.env.KEPT,
    argv: process.argv,
}))`;

test('run passes every mapped secret via env, strips every store credential, and keeps stdout the child’s', async () => {
    const result = await runFixtureCli(['secrets', 'run', '--', process.execPath, '-e', PRINT_ENV, 'arg'], {
        BW_TOKEN: 'bw-credential',
        VAULT_TOKEN: 'vault-credential',
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
        VAULT_TOKEN: null,
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

test('set writes the stdin value, minus one trailing newline, to the ref’s store and key, and never prints it', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const mapping: SecretsMapping = {
        stores: { bw: bw.store },
        secrets: { TELEGRAM_TOKEN: bw.store.secret('TELEGRAM_TOKEN_UMBRA'), API_KEY: bw.store.secret() },
    };

    const first = await runCommand(mapping, ['secrets', 'set', 'TELEGRAM_TOKEN'], { stdin: `${SENTINEL}\n\n` });
    const second = await runCommand(mapping, ['secrets', 'set', 'API_KEY'], { stdin: 'api-value' });

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

    const result = await runCommand(
        { stores: { bw: bw.store }, secrets: { API_KEY: bw.store.secret() } },
        ['secrets', 'set', 'NOT_MAPPED'],
        { stdin: SENTINEL },
    );

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('NOT_MAPPED');
    expect(bw.writes).toEqual([]);
});

test('set refuses an empty value and a value given as an argument', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const mapping: SecretsMapping = { stores: { bw: bw.store }, secrets: { API_KEY: bw.store.secret() } };

    const empty = await runCommand(mapping, ['secrets', 'set', 'API_KEY'], { stdin: '\n' });
    const argument = await runCommand(mapping, ['secrets', 'set', 'API_KEY', SENTINEL], { stdin: 'from-stdin' });

    expect(empty.exitCode).toBe(1);
    expect(argument.exitCode).toBe(1);
    expect(bw.writes).toEqual([]);
});

// --- list ---

test('list shows each name’s store, key and status, never a value, and fails when any is missing', async () => {
    const bw = createMemoryStore({ id: 'bw', data: { API_KEY: SENTINEL, DB: 'db-value' } });
    const mapping: SecretsMapping = {
        stores: { bw: bw.store },
        secrets: {
            API_KEY: bw.store.secret(),
            DB_PASSWORD: bw.store.secret('DB'),
            GONE: bw.store.secret(),
        },
    };

    const result = await runCommand(mapping, ['secrets', 'list'], { env: { DB_PASSWORD: 'env-value' } });

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

    const result = await runCommand({ stores: { bw: bw.store }, secrets: { API_KEY: bw.store.secret() } }, [
        'secrets',
        'list',
    ]);

    expect(result.exitCode).toBe(0);
    expectNoLeak(result, SENTINEL);
});

// --- import ---

test('import writes every non-empty variable in one call, skips empty and credential names, and leaves the file', async () => {
    const bw = createMemoryStore({ id: 'bw', credentialEnv: ['BW_TOKEN'] });
    const vault = createMemoryStore({ id: 'vault', credentialEnv: ['VAULT_TOKEN'] });
    const mapping: SecretsMapping = { stores: { bw: bw.store }, secrets: { SMTP: vault.store.secret() } };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-import-'));
    const file = path.join(dir, 'app.env');
    const content = `API_KEY=${SENTINEL}\nEMPTY=\nBW_TOKEN=bw-cred\nVAULT_TOKEN=vault-cred\nDB_URL=postgres://x\n`;
    await fs.writeFile(file, content);

    const result = await runCommand(mapping, ['secrets', 'import', '--file', file]);

    expect(result.exitCode).toBe(0);
    expect(bw.writes).toEqual([
        [
            { key: 'API_KEY', value: SENTINEL },
            { key: 'DB_URL', value: 'postgres://x' },
        ],
    ]);
    expect(vault.writes).toEqual([]);
    expect(result.stdout).toContain('Skipped, empty: EMPTY\n');
    expect(result.stdout).toContain('Skipped, store credentials: BW_TOKEN, VAULT_TOKEN\n');
    expect(result.stdout).toContain('API_KEY: bw.secret(),\nDB_URL: bw.secret(),\n');
    expect(result.stdout).toContain(`${file} was left untouched`);
    expect(await fs.readFile(file, 'utf8')).toBe(content);
    expectNoLeak(result, SENTINEL);
    expectNoLeak(result, 'bw-cred');
});

test('import with several stores and no --store fails listing the aliases', async () => {
    const bw = createMemoryStore({ id: 'bw' });
    const vault = createMemoryStore({ id: 'vault' });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-import-'));
    const file = path.join(dir, '.env');
    await fs.writeFile(file, 'API_KEY=x\n');
    const mapping: SecretsMapping = { stores: { bw: bw.store, vault: vault.store }, secrets: {} };

    const failed = await runCommand(mapping, ['secrets', 'import', '--file', file]);
    const chosen = await runCommand(mapping, ['secrets', 'import', '--file', file, '--store', 'vault']);

    expect(failed.exitCode).toBe(1);
    expect(failed.errors).toContain('bw, vault');
    expect(chosen.exitCode).toBe(0);
    expect(chosen.stdout).toContain('API_KEY: vault.secret(),\n');
    expect(bw.writes).toEqual([]);
    expect(vault.writes).toEqual([[{ key: 'API_KEY', value: 'x' }]]);
});

// --- login ---

test('login prompts once through stdin and calls the store’s login with the requested access', async () => {
    const bw = createMemoryStore({ id: 'bw', login: true });
    const mapping: SecretsMapping = { stores: { bw: bw.store }, secrets: {} };

    const read = await runCommand(mapping, ['secrets', 'login'], { stdin: `${SENTINEL}\n` });
    const write = await runCommand(mapping, ['secrets', 'login', 'bw', '--write'], { stdin: 'write-token' });

    expect(read.exitCode).toBe(0);
    expect(write.exitCode).toBe(0);
    expect(bw.logins).toEqual([
        { access: 'read', answer: SENTINEL },
        { access: 'write', answer: 'write-token' },
    ]);
    expectNoLeak(read, SENTINEL);
    expectNoLeak(write, 'write-token');
});

test('login fails naming the alias of a store without login, or listing aliases when ambiguous', async () => {
    const plain = createMemoryStore({ id: 'plain' });
    const bw = createMemoryStore({ id: 'bw', login: true });

    const noLogin = await runCommand({ stores: { plain: plain.store }, secrets: {} }, ['secrets', 'login']);
    const ambiguous = await runCommand({ stores: { plain: plain.store, bw: bw.store }, secrets: {} }, [
        'secrets',
        'login',
    ]);

    expect(noLogin.exitCode).toBe(1);
    expect(noLogin.errors).toContain('"plain"');
    expect(ambiguous.exitCode).toBe(1);
    expect(ambiguous.errors).toContain('plain, bw');
    expect(bw.logins).toEqual([]);
});

// --- refresh ---

test('refresh calls every store’s refresh with its mapped keys and leaves a store without one alone', async () => {
    const bw = createMemoryStore({ id: 'bw', refresh: true });
    // Only referenced, not listed under `stores`.
    const vault = createMemoryStore({ id: 'vault', refresh: true });
    const plain = createMemoryStore({ id: 'plain' });
    const mapping: SecretsMapping = {
        stores: { bw: bw.store, plain: plain.store },
        secrets: {
            API_KEY: bw.store.secret(),
            TOKEN: bw.store.secret('TOKEN_KEY'),
            SMTP: vault.store.secret(),
            OTHER: plain.store.secret(),
        },
    };

    const result = await runCommand(mapping, ['secrets', 'refresh']);

    expect(result.exitCode).toBe(0);
    expect(bw.refreshes).toEqual([['API_KEY', 'TOKEN_KEY']]);
    expect(vault.refreshes).toEqual([['SMTP']]);
    expect(plain.reads).toEqual([]);
    expect(plain.writes).toEqual([]);
    expect(result.stdout).toBe('Refreshed store bw.\nRefreshed store vault.\n');
});

interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    errors: string;
}

interface RunCommandOptions {
    stdin?: string;
    env?: EnvVariables;
}

/** Runs a `secrets` command through clipanion in-process, with a real container and the given mapping. */
async function runCommand(mapping: SecretsMapping, args: string[], options: RunCommandOptions = {}) {
    const provider = defineService({ name: 'AppSecrets', implements: SecretsProvider, setup: () => mapping });
    const cli = new Cli<CommandContext>();
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

interface MemoryLogin {
    access: SecretStoreLoginContext['access'];
    answer: string;
}

function createMemoryStore(options: MemoryStoreOptions) {
    const data = new Map(Object.entries(options.data ?? {}));
    const reads: string[][] = [];
    const writes: SecretStoreEntry[][] = [];
    const logins: MemoryLogin[] = [];
    const refreshes: string[][] = [];

    const definition: SecretStoreDefinition = {
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
        definition.login = async ({ access, prompt }) => {
            logins.push({ access, answer: await prompt('Access token') });
        };
    }

    if (options.refresh) {
        definition.refresh = keys => {
            refreshes.push(keys);
            return Promise.resolve();
        };
    }

    const store: SecretStore = defineSecretStore(definition);
    return { store, reads, writes, logins, refreshes };
}
