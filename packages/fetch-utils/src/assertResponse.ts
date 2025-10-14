import { FetchError } from './FetchError.js';

/**
 * Validates that a fetch Response has a successful status code (2xx).
 * If the response is not ok, reads the response body as text and throws a FetchError.
 *
 * @param response - The fetch Response object to validate
 * @throws {FetchError} If the response status is not ok (non-2xx)
 */
export async function assertResponse(response: Response) {
    if (!response.ok) {
        const message = await response.text();
        throw new FetchError(response, message);
    }
}
