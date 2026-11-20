import type { GoogleService } from './GoogleService.js';

/** The value stored under a token key, as JSON. */
export interface GoogleToken {
    email: string;
    refreshToken: string;
    /** The scopes Google granted at sign-in. */
    scopes: string[];
    /** ISO timestamp of the sign-in. */
    createdAt: string;
}

/**
 * The key an account's refresh token is stored under: `<keyPrefix><service>_TOKEN_<SLUG>`, where
 * `SLUG` is the email upper-cased with every non-alphanumeric character turned into `_`. The slug is
 * lossy; accounts are found by the email inside the value, never by parsing the key.
 * @__NO_SIDE_EFFECTS__
 */
export function googleTokenKey(keyPrefix: string, service: GoogleService, email: string) {
    return googleTokenKeyPrefix(keyPrefix, service) + email.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_');
}

/**
 * The prefix every token key of the service starts with.
 * @__NO_SIDE_EFFECTS__
 */
export function googleTokenKeyPrefix(keyPrefix: string, service: GoogleService) {
    return `${keyPrefix}${service.name}_TOKEN_`;
}

/**
 * Parses a stored token value; `undefined` when it is not a token.
 * @__NO_SIDE_EFFECTS__
 */
export function parseGoogleToken(value: string): GoogleToken | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return undefined;
    }

    if (typeof parsed !== 'object' || parsed === null || !('email' in parsed) || !('refreshToken' in parsed)) {
        return undefined;
    }

    const { email, refreshToken } = parsed;
    if (typeof email !== 'string' || typeof refreshToken !== 'string' || !email || !refreshToken) {
        return undefined;
    }

    const scopes: unknown = 'scopes' in parsed ? parsed.scopes : undefined;
    const createdAt = 'createdAt' in parsed && typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
    return {
        email,
        refreshToken,
        scopes: Array.isArray(scopes) ? scopes.filter((scope: unknown) => typeof scope === 'string') : [],
        createdAt,
    };
}
