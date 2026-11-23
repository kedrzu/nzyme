/**
 * The harness of the Spotify CLI tests: commands run in-process through clipanion with a real
 * container, against the fake Spotify of `fakeSpotify.ts`.
 */
import { PassThrough, Readable } from 'node:stream';

import { spyOn } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import type { CommandClass, CommandContext } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

import { defineSpotify } from '../defineSpotify.js';
import { defineSpotifyCommands } from '../defineSpotifyCommands.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyCommandParams } from '../SpotifyCommandParams.js';
import { SpotifyEndpoints } from '../SpotifyEndpoints.js';
import type { SpotifyOptions } from '../SpotifyOptions.js';
import type { SpotifyToken } from '../spotifyToken.js';
import { spotifySignInCommand } from '../utils/spotifySignInCommand.js';
import { CLIENT_ID, REFRESH_TOKEN } from './fakeSpotify.js';

/** The token secret of the tests, as a product declares it. */
export const SPOTIFY_TOKEN = defineSecret('SPOTIFY_TOKEN');

/** The stored token of a signed-in account: {@link REFRESH_TOKEN} and every scope, unless overridden. */
export function testToken(overrides: Partial<SpotifyToken> = {}): SpotifyToken {
    return {
        refreshToken: REFRESH_TOKEN,
        scopes: ['user-top-read', 'playlist-modify-private'],
        userId: 'owner',
        signedInAt: '2026-11-01T10:00:00.000Z',
        ...overrides,
    };
}

/** The value of the token secret holding {@link testToken}. */
export function testTokenValue(overrides: Partial<SpotifyToken> = {}) {
    return JSON.stringify(testToken(overrides));
}

/** Options of {@link createTestProvider}. */
export interface TestProviderOptions {
    stores: SecretStore[];
    /** The write policy; the first store by default. */
    target?: SecretsProvider['target'];
    /** The declared secrets; {@link SPOTIFY_TOKEN} by default, `undefined` declares none. */
    secrets?: SecretDefinition[] | undefined;
}

/** The project's secrets provider over the test's stores. */
export function createTestProvider({ stores, target, secrets }: TestProviderOptions) {
    return defineService<SecretsProvider>({
        name: 'TestSecrets',
        setup: () => ({
            stores,
            secrets,
            target:
                target ??
                (() => {
                    const [first] = stores;
                    if (!first) {
                        throw new Error('The test gave no store');
                    }

                    return first;
                }),
        }),
    });
}

/** Options of {@link testSpotifyOptions}. */
export interface TestSpotifyOptions extends TestProviderOptions {
    /** The redirect URI sign-in listens on; see {@link freeRedirectUri}. */
    redirectUri?: string;
}

/** The options a product passes `defineSpotifyCommands`: the test's stores, {@link SPOTIFY_TOKEN} and {@link CLIENT_ID}. */
export function testSpotifyOptions(options: TestSpotifyOptions): SpotifyOptions {
    return {
        provider: createTestProvider({ secrets: [SPOTIFY_TOKEN], ...options }),
        token: SPOTIFY_TOKEN,
        clientId: defineService({ name: 'TestSpotifyClientId', setup: () => CLIENT_ID }),
        redirectUri: options.redirectUri,
    };
}

/** The params a command definer gets, prefix `spotify`, over {@link testSpotifyOptions}. */
export function testSpotifyParams(options: TestSpotifyOptions): SpotifyCommandParams {
    return { prefix: 'spotify', spotify: defineSpotify(testSpotifyOptions(options)) };
}

/** A loopback redirect URI on a port free right now, for a sign-in in a test. */
export async function freeRedirectUri() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
    const { port } = probe;
    await probe.stop(true);
    return `http://127.0.0.1:${port}/callback`;
}

/** Options of {@link runSpotifyCommand}. */
export interface RunSpotifyCommandOptions extends TestSpotifyOptions {
    args: string[];
    endpoints: SpotifyEndpoints;
    /** Called once with the sign-in URL `auth` printed, standing in for the browser. */
    browser?: (url: URL) => Promise<void>;
    /** What the command reads from its piped stdin; empty by default. */
    stdin?: string;
}

/**
 * Runs a command of `defineSpotifyCommands` (prefix `spotify`), or `spotify whoami` (a stand-in for a
 * command calling the API: it prints the id `/me` answers), in-process under the binary name `nzyme`.
 */
export function runSpotifyCommand(options: RunSpotifyCommandOptions): Promise<SpotifyCommandResult> {
    const { args, endpoints, browser, stdin } = options;
    return runSpotifyCommands({
        commands: [...defineSpotifyCommands(testSpotifyOptions(options)), defineWhoamiCommand(testSpotifyParams(options))],
        args,
        endpoints,
        browser,
        stdin,
    });
}

/** Options of {@link runSpotifyCommands}. */
export interface RunSpotifyCommandsOptions {
    commands: CommandClass[];
    args: string[];
    endpoints: SpotifyEndpoints;
    /** Called once with the sign-in URL the command printed, standing in for the browser. */
    browser?: (url: URL) => Promise<void>;
    /** What the command reads from its piped stdin; empty by default. */
    stdin?: string;
}

/** What a command run left behind. */
export interface SpotifyCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** What was reported through `console.error`: logs, warnings and the failure report. */
    errors: string;
}

/** The sign-in URL `auth` prints to stderr. */
const SIGN_IN_URL = /https?:\/\/\S+\/authorize\?\S+/;

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/**
 * Runs any command classes in-process through clipanion, under the binary name `nzyme`, with a real
 * container whose `SpotifyEndpoints` point at the fake. `--help` lists the commands.
 */
export async function runSpotifyCommands(options: RunSpotifyCommandsOptions): Promise<SpotifyCommandResult> {
    // Plain help whatever the environment says: CI sets FORCE_COLOR, and the help text the tests read
    // would carry ANSI codes.
    const cli = new Cli<CommandContext>({ binaryName: 'nzyme', enableColors: false });
    for (const command of options.commands) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);

    const container = createContainer();
    container.set(EnvVariables, {});
    container.set(SpotifyEndpoints, options.endpoints);

    let errors = '';
    const exitCodes: (number | string | null | undefined)[] = [];
    const spies = [
        // Recorded, not performed: the base `Command.catch` exits 1 after reporting an error.
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited();
        }),
        spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors += args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
        }),
    ];

    const stdout = collect();
    const stderr = collect();
    const browsed = options.browser ? openPrintedUrl(stderr, options.browser) : undefined;
    try {
        const code = await cli.run(options.args, {
            container,
            stdin: Readable.from([options.stdin ?? '']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });
        // A command that failed before printing the sign-in URL never reaches the browser.
        if (SIGN_IN_URL.test(stderr.text())) {
            await browsed;
        }

        const exited = exitCodes[0];
        return {
            exitCode: typeof exited === 'number' ? exited : code,
            stdout: stdout.text(),
            stderr: stderr.text(),
            errors,
        };
    } finally {
        for (const spy of spies) {
            spy.mockRestore();
        }
    }
}

/** Waits for the sign-in URL on stderr and hands it to the stand-in browser. */
async function openPrintedUrl(stderr: ReturnType<typeof collect>, browser: (url: URL) => Promise<void>) {
    const printed = await new Promise<string>(resolve => {
        stderr.stream.on('data', () => {
            const match = SIGN_IN_URL.exec(stderr.text());
            if (match) {
                resolve(match[0]);
            }
        });
    });
    await browser(new URL(printed));
}

/** `spotify whoami`: calls the API as the signed-in account and prints the id `/me` answers. */
function defineWhoamiCommand(params: SpotifyCommandParams): CommandClass {
    return class WhoamiCommand extends Command {
        static override paths = [['spotify', 'whoami']];

        override async run() {
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, params.prefix) });
            const result = await api({ method: 'GET', path: '/me' });
            if (result.status !== 200) {
                throw new SpotifyError({ operation: 'profile read', status: result.status });
            }

            this.context.stdout.write(`${result.data.id}\n`);
        }
    };
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
