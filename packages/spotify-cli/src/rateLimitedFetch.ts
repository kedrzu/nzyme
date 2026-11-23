import type { Fetch } from '@nzyme/types/Fetch.js';

import { SpotifyError } from './SpotifyError.js';

/** The longest `Retry-After` waited out; a longer one (a quota, not a burst) fails at once. */
const MAX_WAIT_SECONDS = 10;
const MAX_RETRIES = 2;

/**
 * Wraps `fetch` for Spotify's rate limit: a 429 asking to wait at most 10 s is waited out and the
 * request sent again, at most twice; any other 429 throws a `SpotifyError` naming the wait and
 * Spotify's `error.reason` code, the only field of the body read. Requests must have a replayable
 * body (a string, as `createOpenApiFetch` sends JSON).
 * @__NO_SIDE_EFFECTS__
 */
export function rateLimitedFetch(fetch: Fetch): Fetch {
    return async function fetchWithinRateLimit(input, init) {
        for (let retries = 0; ; retries++) {
            const response = await fetch(input, init);
            if (response.status !== 429) {
                return response;
            }

            const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
            if (retryAfter == null || retryAfter > MAX_WAIT_SECONDS || retries >= MAX_RETRIES) {
                throw new SpotifyError({
                    operation: describeRequest(input, init),
                    status: 429,
                    retryAfter,
                    reason: await readReason(response),
                });
            }

            await response.body?.cancel();
            await Bun.sleep(retryAfter * 1000);
        }
    };
}

function parseRetryAfter(header: string | null) {
    const seconds = header === null ? Number.NaN : Number(header);
    return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

/** `GET /v1/me/top/artists`: the method and path, never the query (it may carry user input). */
function describeRequest(input: string | Request | URL, init: RequestInit | undefined) {
    if (input instanceof Request) {
        return `${init?.method ?? input.method} ${new URL(input.url).pathname}`;
    }

    const url = typeof input === 'string' ? new URL(input) : input;
    return `${init?.method ?? 'GET'} ${url.pathname}`;
}

/** Spotify's `error.reason` code (`QUOTA_EXCEEDED`); nothing else of the body is read. */
async function readReason(response: Response) {
    const body: unknown = await response.json().catch(() => undefined);
    if (typeof body !== 'object' || body === null || !('error' in body)) {
        return undefined;
    }

    const { error } = body;
    if (typeof error !== 'object' || error === null || !('reason' in error)) {
        return undefined;
    }

    const { reason } = error;
    // A code, never free text: anything else is dropped rather than quoted.
    return typeof reason === 'string' && /^[A-Z_]{1,64}$/.test(reason) ? reason : undefined;
}
