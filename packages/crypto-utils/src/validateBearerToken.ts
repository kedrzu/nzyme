import { parseBearerToken } from './parseBearerToken.js';
import { stringEqualTimingSafe } from './stringEqualsTimingSafe.node.js';

/**
 * Parameters for validating a Bearer token
 *
 * @property tokenProvided - The Bearer token to validate (from Authorization header)
 * @property tokenRequested - The expected token value to compare against
 */
type BearerTokenParams = {
    tokenProvided: string | null | undefined;
    tokenRequested: string;
};

/**
 * Validates a Bearer token against an expected value
 *
 * Extracts the token value from the provided Bearer token string and compares it
 * with the expected token using timing-safe comparison to prevent timing attacks.
 *
 * @param params - Object containing the provided token and expected token
 * @returns true if tokens match, false otherwise or if no token is provided
 */
export function validateBearerToken(params: BearerTokenParams) {
    let token = params.tokenProvided;
    if (!token) {
        return false;
    }

    token = parseBearerToken(token);

    return stringEqualTimingSafe(token, params.tokenRequested);
}
