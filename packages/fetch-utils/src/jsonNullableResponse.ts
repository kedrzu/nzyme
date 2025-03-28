import { FetchError } from './FetchError.js';

/**
 * Parse a JSON response.
 * Returns null if the response is 404.
 */
export async function jsonNullableResponse<T>(response: Response) {
    if (response.ok) {
        return (await response.json()) as T;
    }

    if (response.status === 404) {
        return null;
    }

    throw new FetchError(response);
}
