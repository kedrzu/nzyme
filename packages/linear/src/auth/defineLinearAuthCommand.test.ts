import { createHash } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';

import { afterEach, expect, spyOn, test } from 'bun:test';
import { Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import * as browser from '@nzyme/node-utils/openInBrowser.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { defineLinearAuth } from './defineLinearAuth.js';
import { defineLinearAuthCommand } from './defineLinearAuthCommand.js';

const CODE = 'code-sentinel-5e0b';
const ACCESS_TOKEN = 'lin_oauth_access-sentinel-91fd';
const REFRESH_TOKEN = 'refresh-sentinel-0c7e';
const LINEAR_SESSION = defineSecret('LINEAR_SESSION');
const LINEAR_TOKEN = defineSecret('LINEAR_TOKEN');
const originalFetch = globalThis.fetch;

let browserSpy: ReturnType<typeof spyOn<typeof browser, 'openInBrowser'>> | undefined;

afterEach(() => {
    browserSpy?.mockRestore();
    globalThis.fetch = originalFetch;
});

test('auth exchanges the code with the PKCE verifier, stores the grant, then removes the replaced secret, printing no token', async () => {
    const linear = stubLinear();
    const redirectUri = await freeRedirectUri();

    const { result, authorizeUrl, operations } = await signIn({ redirectUri, replaces: true });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Signed in to Linear as Ada (workspace healed).\n');
    expect(result.stdout).toContain('LINEAR_SESSION stored in your personal secret store.\n');

    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://linear.app/oauth/authorize');
    expect(Object.fromEntries(authorizeUrl.searchParams)).toEqual({
        client_id: 'client-1',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'read,write',
        state: expect.any(String) as string,
        code_challenge: expect.any(String) as string,
        code_challenge_method: 'S256',
    });

    const exchange = linear.requests.find(request => request.url === 'https://api.linear.app/oauth/token');
    expect(exchange?.contentType).toBe('application/x-www-form-urlencoded');
    const form = Object.fromEntries(new URLSearchParams(exchange?.body));
    expect(form).toEqual({
        grant_type: 'authorization_code',
        code: CODE,
        redirect_uri: redirectUri,
        client_id: 'client-1',
        code_verifier: expect.any(String) as string,
    });
    // The verifier sent is the one the challenge in the authorize URL was derived from.
    const challenge = createHash('sha256').update(String(form.code_verifier)).digest('base64url');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBe(challenge);

    const graphql = linear.requests.find(request => request.url === 'https://api.linear.app/graphql');
    expect(graphql?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    // The new grant is written first; only then is the old API key removed.
    expect(operations.map(operation => [operation.kind, operation.keys])).toEqual([
        ['write', ['LINEAR_SESSION']],
        ['delete', ['LINEAR_TOKEN']],
    ]);
    const stored: unknown = JSON.parse(operations[0]?.values?.[0] ?? '');
    expect(stored).toMatchObject({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
    expect(isPlainObject(stored) && stored.expiresAt).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    expectNoToken(result);
});

test('auth in another workspace stores nothing, deletes nothing and says which workspace to pick', async () => {
    stubLinear({ workspace: 'other-team' });

    const { result, operations } = await signIn({
        redirectUri: await freeRedirectUri(),
        organization: 'healed',
        replaces: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
        'Signed in to the Linear workspace other-team, but this CLI accepts only healed — ' +
            'run `auth` again and pick that workspace.\n',
    );
    expect(result.stdout).not.toContain('Signed in to Linear as');
    expect(operations).toEqual([]);
    expectNoToken(result);
});

test('auth accepts the configured workspace, and a store that cannot delete is not an error', async () => {
    stubLinear();

    const { result, operations } = await signIn({
        redirectUri: await freeRedirectUri(),
        organization: 'healed',
        replaces: true,
        canDelete: false,
    });

    expect(result.exitCode).toBe(0);
    expect(operations.map(operation => operation.kind)).toEqual(['write']);
});

test("auth stores nothing and names only Linear's error when it refuses the code exchange", async () => {
    stubLinear({ exchange: { status: 400, body: { error: 'invalid_grant', access_token: ACCESS_TOKEN } } });

    const { result, operations } = await signIn({ redirectUri: await freeRedirectUri(), replaces: true });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Linear refused the code exchange (invalid_grant)');
    expect(operations).toEqual([]);
    expectNoToken(result);
});

/** What Linear answers. */
interface StubLinearOptions {
    workspace?: string;
    exchange?: { status: number; body: unknown };
}

/** A recorded request to the fake Linear. */
interface StubRequest {
    url: string;
    contentType: string | null;
    authorization: string | null;
    body: string;
}

/** Replaces `fetch`, except for the loopback redirect the stubbed browser follows. */
function stubLinear(options: StubLinearOptions = {}) {
    const requests: StubRequest[] = [];
    globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input);
            if (!url.startsWith('https://api.linear.app/')) {
                return originalFetch(input, init);
            }

            const headers = new Headers(init?.headers);
            requests.push({
                url,
                contentType: headers.get('content-type'),
                authorization: headers.get('authorization'),
                body: typeof init?.body === 'string' ? init.body : '',
            });

            if (url.endsWith('/oauth/token')) {
                const answer = options.exchange ?? {
                    status: 200,
                    body: {
                        access_token: ACCESS_TOKEN,
                        token_type: 'Bearer',
                        expires_in: 86_399,
                        refresh_token: REFRESH_TOKEN,
                        scope: 'read write',
                    },
                };
                return Response.json(answer.body, { status: answer.status });
            }

            return Response.json({
                data: {
                    viewer: { name: 'Ada', organization: { urlKey: options.workspace ?? 'healed', name: 'Healed' } },
                },
            });
        },
        { preconnect: originalFetch.preconnect },
    );

    return { requests };
}

/** One store operation, in the order the command made it. */
interface StoreOperation {
    kind: 'write' | 'delete';
    keys: string[];
    values?: string[];
}

/** Options of {@link signIn}. */
interface SignInOptions {
    redirectUri: string;
    organization?: string;
    /** Whether the sign-in replaces the personal API key secret. */
    replaces?: boolean;
    /** Whether the store implements `delete`; true by default. */
    canDelete?: boolean;
}

/**
 * Runs `auth`. The stubbed browser does what Linear does once the person consents: a redirect to the
 * URI carrying the code and the state of the authorize URL.
 */
async function signIn(options: SignInOptions) {
    const { redirectUri } = options;
    const opened = Promise.withResolvers<URL>();
    browserSpy = spyOn(browser, 'openInBrowser').mockImplementation(url => {
        const authorizeUrl = new URL(url);
        const redirect = new URL(redirectUri);
        // The server listens on 127.0.0.1, where a browser lands when `localhost` resolves to `::1` first.
        redirect.hostname = '127.0.0.1';
        redirect.searchParams.set('code', CODE);
        redirect.searchParams.set('state', authorizeUrl.searchParams.get('state') ?? '');
        opened.resolve(authorizeUrl);
        void fetch(redirect);
    });

    const operations: StoreOperation[] = [];
    const store: SecretStore = {
        id: 'fake:personal',
        readAll: () => Promise.resolve(new Map()),
        write: entries => {
            operations.push({
                kind: 'write',
                keys: entries.map(entry => entry.key),
                values: entries.map(entry => entry.value),
            });
            return Promise.resolve();
        },
    };
    if (options.canDelete !== false) {
        store.delete = keys => {
            operations.push({ kind: 'delete', keys });
            return Promise.resolve();
        };
    }

    const auth = defineLinearAuth({
        store: defineService<SecretStore>({ name: 'TestLinearStore', setup: () => store }),
        token: LINEAR_SESSION,
        clientId: 'client-1',
        scopes: ['read', 'write'],
        redirectUri,
        signInCommand: 'linear auth',
        organization: options.organization,
        replaces: options.replaces ? [LINEAR_TOKEN] : undefined,
    });

    const cli = new Cli<CommandContext>({ binaryName: 'healed', enableColors: false });
    cli.register(defineLinearAuthCommand({ auth }));

    const container = createContainer();
    container.set(EnvVariables, {});
    const stdout = collect();
    const stderr = collect();
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
        const exitCode = await cli.run(['auth'], {
            container,
            stdin: Readable.from(['']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });
        expect(browserSpy).toHaveBeenCalledTimes(1);
        return {
            result: { exitCode, stdout: stdout.text(), stderr: stderr.text(), errors: errors.mock.calls.join('\n') },
            authorizeUrl: await opened.promise,
            operations,
        };
    } finally {
        errors.mockRestore();
    }
}

/** A `localhost` redirect URI on a port nothing listens on right now. */
async function freeRedirectUri() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const { port } = probe;
    await probe.stop(true);
    return `http://localhost:${port}/callback`;
}

function expectNoToken(result: { stdout: string; stderr: string; errors: string }) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, CODE]) {
        expect(output).not.toContain(token);
    }
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
