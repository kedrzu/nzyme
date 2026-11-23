import { expect, spyOn, test } from 'bun:test';

import { defineService } from '@nzyme/ioc/Service.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore, SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { defineSlackAuth } from './defineSlackAuth.js';
import { SlackSignInRequiredError } from './SlackSignInRequiredError.js';

const HOUR = 60 * 60 * 1000;
const SLACK_SESSION = defineSecret('SLACK_SESSION');
const SIGN_IN_COMMAND = 'bun healed slack auth';
const ACCESS_TOKEN = 'xoxe-access-sentinel-3f1a';
const REFRESH_TOKEN = 'refresh-sentinel-8c2d';
const NEW_ACCESS_TOKEN = 'xoxe-access-sentinel-b7e0';
const NEW_REFRESH_TOKEN = 'refresh-sentinel-41a9';

test('returns a token with more than an hour left without calling Slack', async () => {
    const { auth, slackCalls } = setUp({ stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() + 2 * HOUR) });

    expect(await auth.get()).toBe(ACCESS_TOKEN);
    expect(slackCalls).toHaveLength(0);
});

test('refreshes a token about to expire, stores the new grant, and reads it back on the next call', async () => {
    const { auth, slackCalls, store } = setUp({
        stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() + 10 * 60 * 1000),
        slack: () => ({
            ok: true,
            access_token: NEW_ACCESS_TOKEN,
            refresh_token: NEW_REFRESH_TOKEN,
            expires_in: 43_200,
        }),
    });

    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);
    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);

    expect(slackCalls).toHaveLength(1);
    expect(Object.fromEntries(slackCalls[0]!)).toEqual({
        client_id: 'client-1',
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN,
    });
    const written: unknown = JSON.parse(store.values.get('SLACK_SESSION')!);
    expect(written).toMatchObject({ accessToken: NEW_ACCESS_TOKEN, refreshToken: NEW_REFRESH_TOKEN });
    expect(isPlainObject(written) && written.expiresAt).toBeGreaterThan(Date.now() + 11 * HOUR);
});

// A long-running process: its cached read still holds the sign-in another process has since refreshed.
test('reads past the store cache before refreshing, and takes the newer grant without calling Slack', async () => {
    const { auth, slackCalls, store } = setUp({
        stored: session(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN, Date.now() + 12 * HOUR),
    });
    store.cache = new Map(Object.entries(session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000)));

    expect(await auth.get()).toBe(NEW_ACCESS_TOKEN);
    expect(slackCalls).toHaveLength(0);
});

test.each(['invalid_refresh_token', 'token_expired', 'token_revoked', 'invalid_auth'])(
    'asks for a new sign-in, naming the sign-in command, when Slack refuses the refresh with %s',
    async refusal => {
        const { auth } = setUp({
            stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000),
            slack: () => ({ ok: false, error: refusal }),
        });

        const error = await auth.get().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(SlackSignInRequiredError);
        expect(error).toHaveProperty(
            'message',
            'Your Slack sign-in has expired — run `bun healed slack auth`, then retry',
        );
    },
);

// A passing Slack outage must not cost the developer a sign-in: the refresh token still works.
test('fails without asking for a sign-in when Slack answers the refresh with a transient error', async () => {
    const { auth, store } = setUp({
        stored: session(ACCESS_TOKEN, REFRESH_TOKEN, Date.now() - 1000),
        slack: () => ({ ok: false, error: 'service_unavailable' }),
    });

    const error = await auth.get().catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(SlackSignInRequiredError);
    expect(error).toHaveProperty('message', 'Slack did not answer the token refresh');
    expect(JSON.parse(store.values.get('SLACK_SESSION')!)).toMatchObject({ refreshToken: REFRESH_TOKEN });
});

test.each([
    ['nothing is stored', {}],
    ['the value is not JSON', { SLACK_SESSION: 'xoxp-legacy-token' }],
    [
        'the value lacks the refresh token',
        { SLACK_SESSION: JSON.stringify({ accessToken: ACCESS_TOKEN, expiresAt: 1 }) },
    ],
])('asks for a sign-in without calling Slack when %s', async (_case, stored: Record<string, string>) => {
    const { auth, slackCalls } = setUp({ stored });

    const error = await auth.get().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlackSignInRequiredError);
    expect(error).toHaveProperty('message', 'No Slack sign-in is stored — run `bun healed slack auth`, then retry');
    expect(slackCalls).toHaveLength(0);
});

test('writes a signed-in grant to the store and reads it back', async () => {
    const { auth, store } = setUp({ stored: {} });

    await auth.store({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, expiresIn: 43_200 });

    expect(await auth.get()).toBe(ACCESS_TOKEN);
    expect(store.values.has('SLACK_SESSION')).toBe(true);
});

test('never prints a token or puts it in an error, whatever the refresh ends in', async () => {
    const tokens = [ACCESS_TOKEN, REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN];
    const answers = [
        { ok: true, access_token: NEW_ACCESS_TOKEN, refresh_token: NEW_REFRESH_TOKEN, expires_in: 43_200 },
        { ok: false, error: 'invalid_refresh_token' },
        { ok: false, error: 'service_unavailable' },
        { ok: true, access_token: NEW_ACCESS_TOKEN },
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
                slack: () => answer,
            });
            await auth.get().catch((caught: unknown) => errors.push(caught));
        }
    } finally {
        stdout.mockRestore();
        for (const spy of spies) {
            spy.mockRestore();
        }
    }

    expect(errors).toHaveLength(3);
    const reported = printed + errors.map(error => `${String(error)} ${JSON.stringify(error)}`).join('\n');
    for (const token of tokens) {
        expect(reported).not.toContain(token);
    }
});

function session(accessToken: string, refreshToken: string, expiresAt: number): Record<string, string> {
    return { SLACK_SESSION: JSON.stringify({ accessToken, refreshToken, expiresAt }) };
}

/** Options for {@link setUp}. */
interface SetUpOptions {
    /** What the developer's store holds. */
    stored: Record<string, string>;
    /** Slack's answer to `oauth.v2.access`. */
    slack?: () => object;
}

/** The auth over the developer's store. Slack is a fake `fetch` recording the forms it was sent. */
function setUp({ stored, slack }: SetUpOptions) {
    const store = createFakeStore(stored);
    const slackCalls: URLSearchParams[] = [];

    const unit = defineSlackAuth({
        // The tests hand `create` the store itself.
        store: defineService<SecretStore>({ name: 'TestSlackStore', setup: () => store }),
        token: SLACK_SESSION,
        clientId: 'client-1',
        userScopes: ['search:read'],
        redirectUri: 'http://localhost:8760/callback',
        signInCommand: SIGN_IN_COMMAND,
    });
    const auth = unit.create({
        secretStore: store,
        fetch: (_input, init) => {
            slackCalls.push(init?.body instanceof URLSearchParams ? init.body : new URLSearchParams());
            return Promise.resolve(Response.json(slack?.() ?? { ok: false, error: 'unexpected_call' }));
        },
    });

    return { auth, slackCalls, store };
}

/** A cached store in memory, with `values` exposed for assertions. */
interface FakeStore extends SecretStore {
    /** What the store itself holds. */
    values: Map<string, string>;
    /** A read cached earlier, returned by `readAll` until `refresh` or `write` drops it. */
    cache: Map<string, string> | null;
}

function createFakeStore(initial: Record<string, string>): FakeStore {
    const fake: FakeStore = {
        values: new Map(Object.entries(initial)),
        cache: null,
        id: `fake:${crypto.randomUUID()}`,
        readAll: () => Promise.resolve(new Map(fake.cache ?? fake.values)),
        write: (entries: SecretStoreEntry[]) => {
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
