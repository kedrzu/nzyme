/**
 * Only the message of a caught error: an HTTP client's error object carries the request, credentials
 * included.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
