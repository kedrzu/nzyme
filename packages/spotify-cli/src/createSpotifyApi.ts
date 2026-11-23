import { createOpenApiFetch } from '@nzyme/openapi/openapi-fetch.js';
import type { Fetch } from '@nzyme/types/Fetch.js';

import { rateLimitedFetch } from './rateLimitedFetch.js';
import type { paths } from './schema.gen.js';
import { signInAgainError } from './utils/signInAgainError.js';

/** The typed Spotify Web API client, authorised as the signed-in account. */
export type SpotifyApi = ReturnType<typeof createOpenApiFetch<paths>>;

/** Params of {@link createSpotifyApi}. */
export interface CreateSpotifyApiParams {
    /** The Web API root, with its version. */
    apiUrl: string;
    accessToken: string;
    /** The command signing in, named when Spotify refuses the token; see `signInAgainError`. */
    signInCommand: string | undefined;
}

/**
 * The typed client over Spotify's Web API with the access token. Answers only a new sign-in fixes
 * never reach the caller: a 401 (the token was revoked meanwhile) and a 403 for an insufficient scope
 * throw the sign-in-again `UsageError`. A short 429 is retried (`rateLimitedFetch`).
 * @__NO_SIDE_EFFECTS__
 */
export function createSpotifyApi(params: CreateSpotifyApiParams): SpotifyApi {
    const { signInCommand } = params;
    const limited = rateLimitedFetch(fetch);

    return createOpenApiFetch<paths>({
        baseUrl: params.apiUrl,
        headers: { Authorization: `Bearer ${params.accessToken}` },
        fetch: fetchSignedIn,
    });

    async function fetchSignedIn(...args: Parameters<Fetch>) {
        const response = await limited(...args);
        if (response.status === 401) {
            throw signInAgainError('Spotify refused the access token (HTTP 401).', signInCommand);
        }

        if (response.status === 403 && (await isInsufficientScope(response))) {
            throw signInAgainError(
                'The Spotify sign-in lacks a permission this call needs (HTTP 403, insufficient scope).',
                signInCommand,
            );
        }

        return response;
    }
}

/** Whether a 403 is Spotify's "Insufficient client scope". Reads a clone: the caller still reads the body. */
async function isInsufficientScope(response: Response) {
    const body: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
    if (typeof body !== 'object' || body === null || !('error' in body)) {
        return false;
    }

    const { error } = body;
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string' &&
        /insufficient client scope/i.test(error.message)
    );
}
