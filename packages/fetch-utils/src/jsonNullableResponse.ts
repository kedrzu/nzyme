import { FetchError } from './FetchError.js';

/**
 * Parses a Response object as JSON, with special handling for 404 responses.
 * Unlike regular JSON parsing, this returns null for 404 status codes instead of throwing an error.
 * @util
 * @param response - The fetch Response object to parse
 * @returns A promise that resolves to the parsed JSON data, or null for 404 responses
 * @throws {FetchError} If the response status is not ok and not 404
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
