import { expect, spyOn, test } from 'bun:test';

import { defineService } from '@nzyme/ioc/Service.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore, SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { defineLinearAuth } from './defineLinearAuth.js';
import { LinearSignInRequiredError } from './LinearSignInRequiredError.js';

const HOUR = 60 * 60 * 1000;
const LINEAR_SESSION = defineSecret('LINEAR_SESSION');
const SIGN_IN_COMMAND = 'bun linear auth';
const ACCESS_TOKEN = 'lin_oauth_access-sentinel-3f1a';
const REFRESH_TOKEN = 'refresh-sentinel-8c2d';
const NEW_ACCESS_TOKEN = 'lin_oauth_access-sentinel-b7e0';
const NEW_REFRESH_TOKEN = 'refresh-sentinel-41a9';

interface LinearAnswer {
    status: number;
    body: unknown;
}

const REFRESHED: LinearAnswer = {
    status: 200,
    body: {
        access_token: NEW_ACCESS_TOKEN,
        token_type: 'Bearer',
        expires_in: 86_399,
        refresh_token: NEW_REFRESH_TOKEN,
        scope: 'read write',
    },
};

test('returns a token with more than an hour left without calling Linear', async () => {
    const { auth, calls } = setUp({ stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() + 2 * HOUR) });

    expect(await auth.get()).toBe(ACCESS_TOKEN);
    expect(calls).toHaveLength(0);
});

// Linear's PKCE app has no client secret: a refresh that sent one would be a different grant.
test('refreshes a token near expiry with no client secret, stores the new pair and returns the new token', async () => {
    const { auth, calls, store } = setUp({
        stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() + 10 * 60 * 1000),
        linear: () => REFRESHED,
    });

    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);
    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.linear.app/oauth/token');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.contentType).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.form.toString()).toBe(
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: REFRESH_TOKEN,
            client_id: 'client-1',
        }).toString(),
    );
    expect(calls[0]?.form.has('client_secret')).toBe(false);

    const written: unknown = JSON.parse(store.values.get('LINEAR_SESSION') ?? '');
    expect(written).toMatchObject({ accessToken: NEW_ACCESS_TOKEN, refreshToken: NEW_REFRESH_TOKEN });
    expect(isPlainObject(written) && written.expiresAt).toBeGreaterThan(Date.now() + 23 * HOUR);
});

// A long-running process: its cached read still holds the sign-in another process has since refreshed.
test('reads past the store cache before refreshing, and takes the newer grant without calling Linear', async () => {
    const { auth, calls, store } = setUp({
        stored: session(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN, Date.now() + 12 * HOUR),
    });
    store.cache = new Map(Object.entries(session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000)));

    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);
    expect(calls).toHaveLength(0);
});

// Verified against the real API: a refused refresh token is HTTP 400 `invalid_grant`.
test('asks for a new sign-in, naming the sign-in command, when Linear answers invalid_grant', async () => {
    const { auth, store } = setUp({
        stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000),
        linear: () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'refresh token expired' } }),
    });

    const error = await auth.get().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinearSignInRequiredError);
    expect(error).toHaveProperty('message', 'Your Linear sign-in has expired — run `bun linear auth`, then retry');
    expect(store.writes).toEqual([]);
});

// A wrong client id or an outage is not the person's sign-in: sending them to sign in again would not help.
test.each([
    ['invalid_client', { status: 400, body: { error: 'invalid_client' } }],
    ['a server error', { status: 500, body: { error: 'server_error' } }],
    ['a non-JSON body', { status: 502, body: '<html>bad gateway</html>' }],
    ['a success without the refresh token', { status: 200, body: { access_token: NEW_ACCESS_TOKEN } }],
])('fails with an ApplicationError, not a sign-in request, on %s', async (_case, answer: LinearAnswer) => {
    const { auth, store } = setUp({
        stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000),
        linear: () => answer,
    });

    const error = await auth.get().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).not.toBeInstanceOf(LinearSignInRequiredError);
    expect(JSON.parse(store.values.get('LINEAR_SESSION') ?? '')).toMatchObject({ refreshToken: REFRESH_TOKEN });
});

test.each([
    ['nothing is stored', {}],
    ['the value is not JSON', { LINEAR_SESSION: 'lin_api_legacy-key' }],
    [
        'the value lacks the refresh token',
        { LINEAR_SESSION: JSON.stringify({ accessToken: ACCESS_TOKEN, expiresAt: 1 }) },
    ],
])('asks for a sign-in without calling Linear when %s', async (_case, stored: Record<string, string>) => {
    const { auth, calls } = setUp({ stored });

    const error = await auth.get().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinearSignInRequiredError);
    expect(error).toHaveProperty('message', 'No Linear sign-in is stored — run `bun linear auth`, then retry');
    expect(calls).toHaveLength(0);
});

test('writes a signed-in grant to the store and reads it back', async () => {
    const { auth, store } = setUp({ stored: {} });

    await auth.store({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, expiresIn: 86_399 });

    expect(await auth.get()).toBe(ACCESS_TOKEN);
    expect(store.values.has('LINEAR_SESSION')).toBe(true);
});

test('never prints a token or puts it in an error, whatever the refresh ends in', async () => {
    const tokens = [ACCESS_TOKEN, REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN];
    const answers: LinearAnswer[] = [
        REFRESHED,
        { status: 400, body: { error: 'invalid_grant' } },
        { status: 400, body: { error: 'invalid_client' } },
        { status: 500, body: { error: 'server_error' } },
        { status: 200, body: { access_token: NEW_ACCESS_TOKEN } },
    ];
    let printed = '';
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
        spyOn(console, method).mockImplementation((...args: unknown[]) => {
            printed += args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
        }),
    );
    const stdout = spyOn(process.stdout, 'write').mockImplementation(chunk => {
        printed += String(chunk);
        return true;
    });

    const errors: unknown[] = [];
    try {
        for (const answer of answers) {
            const { auth } = setUp({
                stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000),
                linear: () => answer,
            });
            await auth.get().catch((caught: unknown) => errors.push(caught));
        }
    } finally {
        stdout.mockRestore();
        for (const spy of spies) {
            spy.mockRestore();
        }
    }

    expect(errors).toHaveLength(4);
    const reported = printed + errors.map(error => `${String(error)} ${JSON.stringify(error)}`).join('\n');
    for (const token of tokens) {
        expect(reported).not.toContain(token);
    }
});

function session(accessToken: string, refreshToken: string, expiresAt: number): Record<string, string> {
    return { LINEAR_SESSION: JSON.stringify({ accessToken, refreshToken, expiresAt }) };
}

/** Options for {@link setUp}. */
interface SetUpOptions {
    /** What the person's store holds. */
    stored: Record<string, string>;
    /** Linear's answer to the token request. */
    linear?: () => LinearAnswer;
}

/** A request the fake Linear received. */
interface LinearCall {
    url: string;
    method: string | undefined;
    contentType: string | null;
    form: URLSearchParams;
}

/** The auth over the person's store. Linear is a fake `fetch` recording the requests it got. */
function setUp({ stored, linear }: SetUpOptions) {
    const store = createFakeStore(stored);
    const calls: LinearCall[] = [];

    const unit = defineLinearAuth({
        // The tests hand `create` the store itself.
        store: defineService<SecretStore>({ name: 'TestLinearStore', setup: () => store }),
        token: LINEAR_SESSION,
        clientId: 'client-1',
        scopes: ['read', 'write'],
        redirectUri: 'http://localhost:8761/callback',
        signInCommand: SIGN_IN_COMMAND,
    });
    const auth = unit.create({
        secretStore: store,
        fetch: (input, init) => {
            calls.push({
                url: String(input),
                method: init?.method,
                contentType: new Headers(init?.headers).get('content-type'),
                form: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
            });
            const answer = linear?.() ?? { status: 400, body: { error: 'unexpected_call' } };
            return Promise.resolve(
                typeof answer.body === 'string'
                    ? new Response(answer.body, { status: answer.status })
                    : Response.json(answer.body, { status: answer.status }),
            );
        },
    });

    return { auth, calls, store };
}

/** A cached store in memory, with `values` exposed for assertions. */
interface FakeStore extends SecretStore {
    /** What the store itself holds. */
    values: Map<string, string>;
    /** A read cached earlier, returned by `readAll` until `refresh` or `write` drops it. */
    cache: Map<string, string> | null;
    /** Every write, in order. */
    writes: SecretStoreEntry[][];
}

function createFakeStore(initial: Record<string, string>): FakeStore {
    const fake: FakeStore = {
        values: new Map(Object.entries(initial)),
        cache: null,
        writes: [],
        id: `fake:${crypto.randomUUID()}`,
        readAll: () => Promise.resolve(new Map(fake.cache ?? fake.values)),
        write: (entries: SecretStoreEntry[]) => {
            fake.writes.push(entries);
            for (const entry of entries) {
                fake.values.set(entry.key, entry.value);
            }
            fake.cache = null;
            return Promise.resolve();
        },
        refresh: () => {
            fake.cache = null;
            return Promise.resolve();
        },
    };

    return fake;
}
