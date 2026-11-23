import { LastfmError } from '../LastfmError.js';
import { readLastfmBody } from '../readLastfmBody.js';

/**
 * Decodes the body of a search or chart method, which looks nothing up by name, so Last.fm's
 * error 6 there is a failure rather than "not found".
 * @util
 * @throws {LastfmError} for every Last.fm error, error 6 included, as `readLastfmBody` does
 */
export async function readListedLastfmBody(response: Response, method: string): Promise<unknown> {
    const body = await readLastfmBody(response, method);
    if (body === null) {
        throw new LastfmError({ method, code: 6, status: response.status });
    }

    return body;
}
