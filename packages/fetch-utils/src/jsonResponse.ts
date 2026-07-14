import { assertResponse } from './assertResponse.js';

/**
 * Parses a Response object as JSON and validates the response status.
 * @util
 * @param response - The fetch Response object to parse
 * @returns A promise that resolves to the parsed JSON data
 * @throws If the response status is not ok or if JSON parsing fails
 */
export async function jsonResponse<T>(response: Response) {
    await assertResponse(response);
    return response.json() as Promise<T>;
}
