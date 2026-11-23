import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { LastfmError } from './LastfmError.js';

/** Last.fm's error 6: the requested artist, album, track, tag or user does not exist. */
const NOT_FOUND = 6;

/**
 * Decodes a Last.fm response body, whatever its HTTP status: Last.fm reports errors as
 * `{ error, message }`, sometimes with a 200. Every endpoint's `response` reads its body through this.
 * @returns the parsed JSON, or `null` for error 6 (not found)
 * @throws {LastfmError} for any other Last.fm error, a body that is not JSON, or a non-2xx status
 * without a Last.fm error body
 */
export async function readLastfmBody(response: Response, method: string): Promise<unknown> {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        // Neither the parse error (it can quote the body) nor the response is kept.
        throw new LastfmError({ method, code: null, status: response.status });
    }

    if (isPlainObject(body) && 'error' in body) {
        const code = typeof body.error === 'number' ? body.error : null;
        if (code === NOT_FOUND) {
            return null;
        }

        throw new LastfmError({ method, code, status: response.status });
    }

    if (!response.ok) {
        throw new LastfmError({ method, code: null, status: response.status });
    }

    return body;
}
