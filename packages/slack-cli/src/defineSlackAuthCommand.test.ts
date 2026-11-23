import { createHash } from 'node:crypto';

import { WebAPIPlatformError } from '@slack/web-api';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import * as browser from '@nzyme/node-utils/openInBrowser.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { SlackCommandResult } from './__fixtures__/slackTestCli.js';
import { fakeSlack, IDENTITY, resetFakeSlack, runSlackCommand, SLACK_TOKEN } from './__fixtures__/slackTestCli.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';

const CODE = 'code-sentinel-5e0b';
const ACCESS_TOKEN = 'xoxe-access-sentinel-91fd';
const REFRESH_TOKEN = 'refresh-sentinel-0c7e';

/** The `apiCall`s the run made, method and options. */
let apiCalls: [string, Record<string, unknown>][] = [];
let browserSpy: ReturnType<typeof spyOn<typeof browser, 'openInBrowser'>> | undefined;

beforeEach(() => {
    resetFakeSlack();
    apiCalls = [];
});

afterEach(() => {
    browserSpy?.mockRestore();
});

test('auth exchanges the code with the PKCE verifier, stores the grant and names the identity, printing no token', async () => {
    fakeSlack.apiCall = (method, options) => {
        apiCalls.push([method, options]);
        return Promise.resolve({
            ok: true,
            authed_user: { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 43_200 },
        });
    };
    const redirectUri = await freeRedirectUri();

    const { result, authorizeUrl } = await signIn(redirectUri);

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.SUCCESS);
    expect(result.stdout).toContain(`Signed in as ${IDENTITY.user} (${IDENTITY.user_id}).\n`);
    expect(result.stdout).toContain(`${SLACK_TOKEN.name} stored in your personal secret store.\n`);

    expect(apiCalls).toHaveLength(1);
    const [method, options] = apiCalls[0]!;
    expect(method).toBe('oauth.v2.access');
    expect(options).toEqual({
        client_id: 'client-1',
        code: CODE,
        code_verifier: expect.any(String),
        redirect_uri: redirectUri,
    });
    // The verifier sent is the one the challenge in the authorize URL was derived from.
    const challenge = createHash('sha256').update(String(options.code_verifier)).digest('base64url');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBe(challenge);
    // `auth.test` speaks with the new token.
    expect(fakeSlack.tokens).toContain(ACCESS_TOKEN);

    expect(result.writes).toHaveLength(1);
    const [entry] = result.writes[0]!;
    expect(entry?.key).toBe(SLACK_TOKEN.name);
    const stored: unknown = JSON.parse(entry!.value);
    expect(stored).toMatchObject({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
    expect(isPlainObject(stored) && stored.expiresAt).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);

    expectNoToken(result);
});

test('auth stores nothing and says what to check when Slack refuses the code exchange', async () => {
    fakeSlack.apiCall = (method, options) => {
        apiCalls.push([method, options]);
        return Promise.reject(new WebAPIPlatformError({ ok: false, error: 'invalid_code' }));
    };

    const { result } = await signIn(await freeRedirectUri());

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
    expect(result.stderr).toBe(
        'Slack refused the code exchange (invalid_code) — check the client id configured for this CLI against ' +
            'the Slack app, then run `slack auth` again.\n',
    );
    expect(apiCalls.map(([method]) => method)).toEqual(['oauth.v2.access']);
    expect(result.writes).toEqual([]);
});

/**
 * Runs `slack auth` with an empty store. The stubbed browser does what Slack does once the developer
 * consents: a redirect to the URI carrying the code and the state of the authorize URL.
 */
async function signIn(redirectUri: string) {
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

    const result = await runSlackCommand({ args: ['slack', 'auth'], stored: {}, redirectUri });
    expect(browserSpy).toHaveBeenCalledTimes(1);
    return { result, authorizeUrl: await opened.promise };
}

/** A `localhost` redirect URI on a port nothing listens on right now. */
async function freeRedirectUri() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const { port } = probe;
    await probe.stop(true);
    return `http://localhost:${port}/callback`;
}

function expectNoToken(result: SlackCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const token of [ACCESS_TOKEN, REFRESH_TOKEN, CODE]) {
        expect(output).not.toContain(token);
    }
}
