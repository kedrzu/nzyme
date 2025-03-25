import { FetchError } from './FetchError.js';

/**
 * Assert that a response is ok.
 */
export async function assertResponse(response: Response) {
    if (!response.ok) {
        const message = await response.text();
        throw new FetchError(response, message);
    }
}
