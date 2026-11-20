/**
 * The harness of the Google CLI tests: a fake Google (token endpoint, a `/me` API and a CLI's own fake
 * API) on a local port, and commands run in-process through clipanion with a real container.
 */
import { PassThrough, Readable } from 'node:stream';

import { spyOn } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import { Option } from '@nzyme/cli-core';
import type { CommandClass, CommandContext } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

import { defineGoogleAccountsCommand } from '../defineGoogleAccountsCommand.js';
import { defineGoogleAuthCommand } from '../defineGoogleAuthCommand.js';
import { GoogleAccountsFactory } from '../GoogleAccountsFactory.js';
import type { GoogleAuthOptions } from '../GoogleAuthOptions.js';
import type { GoogleCommandParams } from '../GoogleCommandParams.js';
import { GoogleEndpoints } from '../GoogleEndpoints.js';
import type { GoogleService } from '../GoogleService.js';

export const CLIENT_ID = 'client-id-test.apps.googleusercontent.com';
export const CLIENT_SECRET = 'client-secret-sentinel-5d1f';
export const REFRESH_TOKEN = 'refresh-token-sentinel-a83c';
export const ACCESS_TOKEN = 'access-token-sentinel-e42a';
export const AUTH_CODE = 'auth-code-sentinel-91cd';
/** Every credential the tests hand out; none may reach any output. */
export const CREDENTIALS = [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN, AUTH_CODE];

export const SCOPES = ['https://example.test/scope.read', 'https://example.test/scope.write'];

/** A service whose address comes from the fake `/me`, called with the access token. */
export const TEST_SERVICE: GoogleService = {
    name: 'GMAIL',
    scopes: SCOPES,
    async resolveEmail(auth, rootUrl) {
        const response = await auth.request<{ email: string }>({ url: `${rootUrl}/me` });
        return response.data.email;
    },
};

/** Options of {@link startFakeGoogle}. */
export interface FakeGoogleOptions {
    /** The address `/me` reports. */
    email: string;
    /** The scopes a sign-in grants; {@link SCOPES} by default. */
    scopes?: string[];
    /**
     * Answers every other path, after the access token is checked: a CLI's fake API. A request without
     * the access token gets 401 without reaching it.
     */
    api?: (request: Request) => Response | Promise<Response>;
    /** Refresh tokens the token endpoint answers `invalid_grant` for. */
    revoked?: string[];
}

/** A local Google: the token endpoint, `/me` and the `api`, recording the grant types it was asked for. */
export function startFakeGoogle(options: FakeGoogleOptions) {
    const grants: string[] = [];
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });
    const url = `http://127.0.0.1:${server.port}`;
    const endpoints: GoogleEndpoints = {
        oauthTokenUrl: `${url}/token`,
        oauthAuthUrl: `${url}/auth`,
        apiRootUrl: url,
    };

    return { endpoints, grants, stop: () => server.stop(true) };

    async function answer(request: Request) {
        const { pathname } = new URL(request.url);
        if (pathname === '/me') {
            return request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`
                ? Response.json({ email: options.email })
                : Response.json({ error: 'unauthorized' }, { status: 401 });
        }

        if (pathname !== '/token') {
            if (!options.api) {
                return new Response(null, { status: 404 });
            }

            return request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`
                ? options.api(request)
                : Response.json({ error: 'unauthorized' }, { status: 401 });
        }

        const form = new URLSearchParams(await request.text());
        const grant = form.get('grant_type') ?? '';
        grants.push(grant);
        if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) {
            return Response.json({ error: 'invalid_client' }, { status: 401 });
        }

        if (grant === 'authorization_code' && form.get('code') === AUTH_CODE && form.get('code_verifier')) {
            return Response.json({
                access_token: ACCESS_TOKEN,
                refresh_token: REFRESH_TOKEN,
                scope: (options.scopes ?? SCOPES).join(' '),
                expires_in: 3600,
                token_type: 'Bearer',
            });
        }

        const refreshToken = form.get('refresh_token') ?? '';
        if (grant !== 'refresh_token' || options.revoked?.includes(refreshToken)) {
            return Response.json(
                { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
                { status: 400 },
            );
        }

        return Response.json({
            access_token: ACCESS_TOKEN,
            expires_in: 3600,
            token_type: 'Bearer',
        });
    }
}

/** A stored token value, as sign-in writes it. */
export function tokenValue(email: string, refreshToken = REFRESH_TOKEN) {
    return JSON.stringify({ email, refreshToken, scopes: SCOPES });
}

/** Options of {@link runGoogleCommand}. */
export interface RunGoogleCommandOptions {
    args: string[];
    stores: SecretStore[];
    /** The write policy; the first store by default. */
    target?: SecretsProvider['target'];
    endpoints: GoogleEndpoints;
    accounts?: string[];
    /** Called once with the sign-in URL the command printed, standing in for the browser. */
    browser?: (url: URL) => Promise<void>;
}

/** What a command run left behind. */
export interface GoogleCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** What was reported through `console.error`: logs, warnings and the failure report. */
    errors: string;
}

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/**
 * Runs `gmail auth`, `gmail accounts` or `gmail whoami` (a stand-in for a CLI command that authorises
 * an account and calls the API) in-process, under the binary name `nzyme`.
 */
export function runGoogleCommand(options: RunGoogleCommandOptions): Promise<GoogleCommandResult> {
    const provider = createTestProvider(options.stores, options.target);
    const authOptions: GoogleAuthOptions = { provider, accounts: options.accounts };
    const params: GoogleCommandParams = { prefix: 'gmail', service: TEST_SERVICE, options: authOptions };

    return runCommands({
        commands: [defineGoogleAuthCommand(params), defineGoogleAccountsCommand(params), defineWhoamiCommand(params)],
        args: options.args,
        endpoints: options.endpoints,
        browser: options.browser,
    });
}

/**
 * The project's secrets provider over the test's stores.
 * @param target The write policy; the first store by default.
 */
export function createTestProvider(stores: SecretStore[], target?: SecretsProvider['target']) {
    return defineService<SecretsProvider>({
        name: 'TestSecrets',
        setup: () => ({
            stores,
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

/** Options of {@link runCommands}. */
export interface RunCommandsOptions {
    commands: CommandClass[];
    args: string[];
    endpoints: GoogleEndpoints;
    /** Called once with the sign-in URL the command printed, standing in for the browser. */
    browser?: (url: URL) => Promise<void>;
    /** What the command reads from its piped stdin; empty by default. */
    stdin?: string;
}

/**
 * Runs a command of a Google CLI in-process through clipanion, under the binary name `nzyme`, with a
 * real container whose `GoogleEndpoints` point at the fake. `--help` lists the commands.
 */
export async function runCommands(options: RunCommandsOptions): Promise<GoogleCommandResult> {
    const cli = new Cli<CommandContext>({ binaryName: 'nzyme' });
    for (const command of options.commands) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);

    const container = createContainer();
    container.set(EnvVariables, {});
    container.set(GoogleEndpoints, options.endpoints);

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
    const browsed = options.browser ? openPrintedUrl(stderr, options.browser) : Promise.resolve();
    try {
        const code = await cli.run(options.args, {
            container,
            stdin: Readable.from([options.stdin ?? '']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });
        await browsed;

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
            const match = /https?:\/\/\S+\/auth\?\S+/.exec(stderr.text());
            if (match) {
                resolve(match[0]);
            }
        });
    });
    await browser(new URL(printed));
}

/** Grants the consent the way Google does: a redirect carrying the code and the state. */
export async function grantConsent(url: URL) {
    const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
    redirect.searchParams.set('code', AUTH_CODE);
    redirect.searchParams.set('state', url.searchParams.get('state') ?? '');
    const response = await fetch(redirect);
    await response.text();
}

/** `gmail whoami [--account]`: authorises the account and asks the API who it is. */
function defineWhoamiCommand(params: GoogleCommandParams): CommandClass {
    return class WhoamiCommand extends Command {
        static override paths = [['gmail', 'whoami']];

        account = Option.String('--account');

        override async run() {
            const accounts = this.container.resolve(GoogleAccountsFactory)(params, this.cli.binaryName);
            const { apiRootUrl } = this.container.resolve(GoogleEndpoints);
            const auth = await accounts.authorize(await accounts.resolveAccount(this.account));
            this.context.stdout.write(`${await params.service.resolveEmail(auth, apiRootUrl)}\n`);
        }
    };
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
