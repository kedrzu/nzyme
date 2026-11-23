/**
 * A recording fake of Spotify on a local port: the accounts service (the token endpoint, and a
 * `consent` standing in for the browser at `/authorize`) and the Web API behind the access token.
 */
import { SPOTIFY_SCOPES } from '../spotifyScopes.js';
import type { SpotifyEndpoints } from '../SpotifyEndpoints.js';

export const CLIENT_ID = 'spotify-client-id-test';
export const REFRESH_TOKEN = 'refresh-token-sentinel-5b7e';
/** The refresh token the fake hands out when it rotates. */
export const ROTATED_REFRESH_TOKEN = 'rotated-refresh-token-sentinel-c4d1';
export const ACCESS_TOKEN = 'access-token-sentinel-93fa';
export const AUTH_CODE = 'auth-code-sentinel-2e68';
/** Every fixed credential the fake hands out; none may reach any output. The PKCE verifiers are in `verifiers`. */
export const CREDENTIALS = [REFRESH_TOKEN, ROTATED_REFRESH_TOKEN, ACCESS_TOKEN, AUTH_CODE];

/** The account `/me` describes. */
export interface FakeSpotifyUser {
    id: string;
    /** Unset, `/me` carries no `display_name`. */
    displayName?: string;
}

/** A 429 the fake answers an API request with. */
export interface FakeSpotifyRateLimit {
    /** The `Retry-After` header, in seconds. */
    retryAfter: number;
    /** The body's `error.reason`. */
    reason?: string;
}

/** Options of {@link startFakeSpotify}. */
export interface FakeSpotifyOptions {
    /** Default `{ id: 'owner', displayName: 'Owner' }`. */
    user?: FakeSpotifyUser;
    /** The scopes a sign-in grants; `SPOTIFY_SCOPES` by default. */
    scopes?: readonly string[];
    /**
     * Answers an API request after the access token is checked, `path` relative to the API root
     * (`/me/top/artists`). `undefined` falls through to the built-in `GET /me`, else a 404.
     */
    api?: (request: Request, path: string) => Response | undefined | Promise<Response | undefined>;
    /** What a refresh returns besides the access token: no refresh token (default), the same one, or a rotated one. */
    refreshReturns?: 'none' | 'same' | 'rotated';
    /** Refresh tokens the token endpoint answers `invalid_grant` for. */
    revoked?: string[];
    /** 429s answered to the next API requests, in order, before any other handling. */
    rateLimits?: FakeSpotifyRateLimit[];
}

/** An API request the fake received. */
export interface FakeSpotifyRequest {
    method: string;
    /** Relative to the API root: `/me/playlists`. */
    path: string;
    query: URLSearchParams;
    /** The JSON body of a write. */
    body?: unknown;
}

/** Overrides of the redirect {@link FakeSpotify.consent} sends. */
export interface FakeSpotifyConsentOptions {
    /** The `state` to send back instead of the one asked for. */
    state?: string;
}

/** A running fake; see {@link startFakeSpotify}. */
export type FakeSpotify = ReturnType<typeof startFakeSpotify>;

/**
 * Starts the fake. `requests` records every API call (429'd ones too), `grants` every token request's
 * grant type, `refreshes` the refresh tokens it accepted, `verifiers` the PKCE verifiers it received,
 * and `violations` every `DELETE` or `PUT`, which no Spotify command may send. The code exchange
 * checks the verifier against the challenge and the redirect URI of the consent.
 */
export function startFakeSpotify(options: FakeSpotifyOptions = {}) {
    const user = options.user ?? { id: 'owner', displayName: 'Owner' };
    const rateLimits = [...(options.rateLimits ?? [])];
    const requests: FakeSpotifyRequest[] = [];
    const grants: string[] = [];
    const refreshes: string[] = [];
    const verifiers: string[] = [];
    const violations: string[] = [];
    let consented: { challenge: string; redirectUri: string } | undefined;

    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });
    const url = `http://127.0.0.1:${server.port}`;
    const endpoints: Required<SpotifyEndpoints> = { accountsUrl: `${url}/accounts`, apiUrl: `${url}/v1` };

    return {
        endpoints,
        requests,
        grants,
        refreshes,
        verifiers,
        violations,
        consent,
        deny,
        stop: () => server.stop(true),
    };

    /**
     * Grants the consent the way Spotify does once the person accepts: a redirect to the URL's
     * `redirect_uri` carrying the code and the state.
     */
    async function consent(authorizeUrl: URL, overrides: FakeSpotifyConsentOptions = {}) {
        const redirectUri = authorizeUrl.searchParams.get('redirect_uri') ?? '';
        consented = { challenge: authorizeUrl.searchParams.get('code_challenge') ?? '', redirectUri };
        const redirect = new URL(redirectUri);
        redirect.searchParams.set('code', AUTH_CODE);
        redirect.searchParams.set('state', overrides.state ?? authorizeUrl.searchParams.get('state') ?? '');
        const response = await fetch(redirect);
        await response.text();
    }

    /** Declines the consent the way Spotify does: a redirect carrying `error=access_denied` and the state. */
    async function deny(authorizeUrl: URL) {
        const redirect = new URL(authorizeUrl.searchParams.get('redirect_uri') ?? '');
        redirect.searchParams.set('error', 'access_denied');
        redirect.searchParams.set('state', authorizeUrl.searchParams.get('state') ?? '');
        const response = await fetch(redirect);
        await response.text();
    }

    async function answer(request: Request) {
        const { pathname, searchParams } = new URL(request.url);
        if (pathname === '/accounts/api/token' && request.method === 'POST') {
            return answerToken(new URLSearchParams(await request.text()));
        }

        if (!pathname.startsWith('/v1/')) {
            return notFound();
        }

        const path = pathname.slice('/v1'.length);
        const text = await request.clone().text();
        requests.push({ method: request.method, path, query: searchParams, body: text ? JSON.parse(text) : undefined });

        if (request.headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
            return apiError(401, 'Invalid access token');
        }

        const limit = rateLimits.shift();
        if (limit) {
            return Response.json(
                { error: { status: 429, message: 'API rate limit exceeded', reason: limit.reason } },
                { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
            );
        }

        if (request.method === 'DELETE' || request.method === 'PUT') {
            violations.push(`${request.method} ${path}`);
            return apiError(403, 'Forbidden by the fake: no Spotify command may remove anything');
        }

        const answered = await options.api?.(request, path);
        if (answered) {
            return answered;
        }

        if (request.method === 'GET' && path === '/me') {
            return Response.json({ id: user.id, display_name: user.displayName, type: 'user', uri: `spotify:user:${user.id}` });
        }

        return notFound();
    }

    async function answerToken(form: URLSearchParams) {
        const grant = form.get('grant_type') ?? '';
        grants.push(grant);
        if (form.get('client_id') !== CLIENT_ID || form.has('client_secret')) {
            return Response.json({ error: 'invalid_client', error_description: 'Invalid client' }, { status: 400 });
        }

        if (grant === 'authorization_code') {
            const verifier = form.get('code_verifier') ?? '';
            verifiers.push(verifier);
            const valid =
                consented !== undefined &&
                form.get('code') === AUTH_CODE &&
                form.get('redirect_uri') === consented.redirectUri &&
                (await challengeOf(verifier)) === consented.challenge;
            return valid
                ? Response.json({
                      access_token: ACCESS_TOKEN,
                      token_type: 'Bearer',
                      scope: (options.scopes ?? SPOTIFY_SCOPES).join(' '),
                      expires_in: 3600,
                      refresh_token: REFRESH_TOKEN,
                  })
                : invalidGrant('Invalid authorization code');
        }

        const refreshToken = form.get('refresh_token') ?? '';
        if (grant !== 'refresh_token' || !refreshToken || options.revoked?.includes(refreshToken)) {
            return invalidGrant('Refresh token revoked');
        }

        refreshes.push(refreshToken);
        const returned =
            options.refreshReturns === 'rotated'
                ? ROTATED_REFRESH_TOKEN
                : options.refreshReturns === 'same'
                  ? refreshToken
                  : undefined;
        return Response.json({
            access_token: ACCESS_TOKEN,
            token_type: 'Bearer',
            scope: SPOTIFY_SCOPES.join(' '),
            expires_in: 3600,
            refresh_token: returned,
        });
    }
}

/** An error body as the Web API sends it. */
export function apiError(status: number, message: string) {
    return Response.json({ error: { status, message } }, { status });
}

async function challengeOf(verifier: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return Buffer.from(digest).toString('base64url');
}

function invalidGrant(description: string) {
    return Response.json({ error: 'invalid_grant', error_description: description }, { status: 400 });
}

function notFound() {
    return apiError(404, 'Service not found');
}
