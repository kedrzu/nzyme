/**
 * The harness of the Google CLI tests: a fake Google (token endpoint, a `/me` API and a CLI's own fake
 * API) on a local port, and commands run in-process through clipanion with a real container.
 */
import { PassThrough, Readable } from 'node:stream';

import { spyOn } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass, CommandContext } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';
import { mergeStores, readStores } from '@nzyme/secrets/utils/readStores.js';

import { authorizeGoogleAccount } from '../authorizeGoogleAccount.js';
import { defineGoogleAccountsCommand } from '../defineGoogleAccountsCommand.js';
import { defineGoogleAuth } from '../defineGoogleAuth.js';
import { defineGoogleAuthCommand } from '../defineGoogleAuthCommand.js';
import type { GoogleAuthOptions } from '../GoogleAuthOptions.js';
import type { GoogleClientCredentials, GoogleClientProvider } from '../GoogleClientProvider.js';
import type { GoogleCommandParams } from '../GoogleCommandParams.js';
import { GoogleEndpoints } from '../GoogleEndpoints.js';
import type { GoogleService } from '../GoogleService.js';

export const CLIENT_ID = 'client-id-test.apps.googleusercontent.com';
export const CLIENT_SECRET = 'client-secret-sentinel-5d1f';
export const REFRESH_TOKEN = 'refresh-token-sentinel-a83c';
export const ACCESS_TOKEN = 'access-token-sentinel-e42a';
export const AUTH_CODE = 'auth-code-sentinel-91cd';
/** The client id and secret, as the stores hold them for the test client provider. */
export const CLIENT_KEYS = { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET };
/** The project's OAuth client the fake accepts by default. */
export const CLIENT: GoogleClientCredentials = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
/** A second OAuth client, for a fake that serves two. */
export const OTHER_CLIENT: GoogleClientCredentials = {
    clientId: 'other-client-test.apps.googleusercontent.com',
    clientSecret: 'other-client-secret-sentinel-7b20',
};
/** Every credential the tests hand out; none may reach any output. */
export const CREDENTIALS = [CLIENT_SECRET, OTHER_CLIENT.clientSecret, REFRESH_TOKEN, ACCESS_TOKEN, AUTH_CODE];

/** The token secret of the test service, as a product declares it. */
export const GMAIL_TOKENS = defineSecret('GMAIL_TOKENS');

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
    /** The OAuth clients the token endpoint accepts; {@link CLIENT} by default. */
    clients?: GoogleClientCredentials[];
}

/** A refresh the fake token endpoint granted. */
export interface FakeGoogleRefresh {
    clientId: string;
    refreshToken: string;
}

/**
 * A local Google: the token endpoint, `/me` and the `api`, recording the grant types it was asked for
 * and the refreshes it granted.
 */
export function startFakeGoogle(options: FakeGoogleOptions) {
    const grants: string[] = [];
    const refreshes: FakeGoogleRefresh[] = [];
    const clients = options.clients ?? [CLIENT];
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });
    const url = `http://127.0.0.1:${server.port}`;
    const endpoints: GoogleEndpoints = {
        oauthTokenUrl: `${url}/token`,
        apiRootUrl: url,
    };

    return { endpoints, grants, refreshes, stop: () => server.stop(true) };

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
        const clientId = form.get('client_id') ?? '';
        if (!clients.some(client => client.clientId === clientId && client.clientSecret === form.get('client_secret'))) {
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

        refreshes.push({ clientId, refreshToken });
        return Response.json({
            access_token: ACCESS_TOKEN,
            expires_in: 3600,
            token_type: 'Bearer',
        });
    }
}

/** The value of a token secret holding these accounts, each with {@link REFRESH_TOKEN} and {@link SCOPES}. */
export function tokensValue(...emails: string[]) {
    return JSON.stringify(Object.fromEntries(emails.map(email => [email, { refreshToken: REFRESH_TOKEN, scopes: SCOPES }])));
}

/** Options of {@link testAuthOptions}. */
export interface TestAuthOptions extends TestProviderOptions {
    tokens: SecretDefinition;
    accounts?: string[];
}

/**
 * The options a product passes a Google command set: a provider over the test's stores, the token
 * secret, and a client provider reading {@link CLIENT_KEYS} from the same stores.
 */
export function testAuthOptions(options: TestAuthOptions): GoogleAuthOptions {
    return {
        provider: createTestProvider(options),
        tokens: options.tokens,
        client: createTestClientProvider(options.stores),
        accounts: options.accounts,
    };
}

/** Options of {@link runGoogleCommand}. */
export interface RunGoogleCommandOptions extends TestProviderOptions {
    args: string[];
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

/** The sign-in URL `auth` prints to stderr. */
const SIGN_IN_URL = /https?:\/\/\S+\/auth\?\S+/;

/** Thrown in place of a real `process.exit`; clipanion reports it to the command's stdout. */
class ProcessExited extends Error {}

/**
 * Runs `gmail auth`, `gmail accounts` or `gmail whoami` (a stand-in for a CLI command that authorises
 * an account and calls the API) in-process, under the binary name `nzyme`.
 */
export function runGoogleCommand(options: RunGoogleCommandOptions): Promise<GoogleCommandResult> {
    const auth = defineGoogleAuth(testAuthOptions({ ...options, tokens: GMAIL_TOKENS }));
    const params: GoogleCommandParams = { prefix: 'gmail', service: TEST_SERVICE, auth };

    return runCommands({
        commands: [defineGoogleAuthCommand(params), defineGoogleAccountsCommand(params), defineWhoamiCommand(params)],
        args: options.args,
        endpoints: options.endpoints,
        browser: options.browser,
    });
}

/** Options of {@link createTestProvider}. */
export interface TestProviderOptions {
    stores: SecretStore[];
    /** The write policy; the first store by default. */
    target?: SecretsProvider['target'];
    /** The declared secrets; unset, the provider declares none. */
    secrets?: SecretDefinition[];
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

/**
 * The product's client provider of the tests: one OAuth client for every account, read from
 * {@link CLIENT_KEYS} in the stores.
 */
export function createTestClientProvider(stores: SecretStore[]) {
    return defineService<GoogleClientProvider>({
        name: 'TestGoogleClients',
        setup: () => ({
            async getClient() {
                const all = mergeStores(await readStores(stores));
                const clientId = all.get('GOOGLE_CLIENT_ID');
                const clientSecret = all.get('GOOGLE_CLIENT_SECRET');
                if (!clientId || !clientSecret) {
                    const missing = clientId ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID';
                    throw new UsageError(`The Google OAuth client is not configured: ${missing} is missing.`);
                }

                return { clientId, clientSecret };
            },
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
            const auth = this.container.resolve(params.auth);
            const { client } = await authorizeGoogleAccount({
                auth,
                service: params.service,
                account: this.account,
                signInCommand: `${this.cli.binaryName} ${params.prefix} auth`,
            });
            this.context.stdout.write(`${await params.service.resolveEmail(client, auth.endpoints.apiRootUrl)}\n`);
        }
    };
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
