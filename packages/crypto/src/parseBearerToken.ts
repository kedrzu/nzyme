const prefix = 'Bearer ';

/**
 * Extracts the token value from a Bearer token string
 *
 * Removes the 'Bearer ' prefix if present and returns the actual token value.
 *
 * @util
 * @param token - The Bearer token string from an Authorization header
 * @returns The extracted token value without the 'Bearer ' prefix
 */
export function parseBearerToken(token: string) {
    token = token.trim();

    if (token.startsWith(prefix)) {
        token = token.substring(prefix.length).trim();
    }

    return token;
}
