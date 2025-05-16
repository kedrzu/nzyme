import { parseBasicAuth } from './parseBasicAuth.js';
import { stringEqualTimingSafe } from './stringEqualsTimingSafe.node.js';

/**
 * Parameters for validating Basic Authentication credentials
 *
 * @property login - The expected username or login
 * @property password - The expected password
 * @property token - The Basic Auth token to validate (from Authorization header)
 */
type BasicAuthParams = {
    login: string;
    password: string;
    token: string | null | undefined;
};

/**
 * Validates a Basic Authentication token against expected credentials
 *
 * Compares the credentials extracted from the token with the expected login
 * and password using timing-safe comparison to prevent timing attacks.
 *
 * @param params - Object containing expected credentials and token to validate
 * @returns true if credentials match, false otherwise or if token is missing
 */
export function validateBasicAuth(params: BasicAuthParams) {
    const token = params.token;
    if (!token) {
        return false;
    }

    const parsed = parseBasicAuth(token);
    return stringEqualTimingSafe(parsed.login, params.login) && stringEqualTimingSafe(parsed.password, params.password);
}
