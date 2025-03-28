import { assertResponse } from './assertResponse.js';

/**
 * Parse a JSON response.
 */
export async function jsonResponse<T>(response: Response) {
    await assertResponse(response);
    return response.json() as Promise<T>;
}
