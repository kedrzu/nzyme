import { UsageError } from '@nzyme/cli-core';

/** What an account signed in with: the refresh token and the scopes Google granted. */
export interface GoogleTokenEntry {
    refreshToken: string;
    scopes: string[];
}

/** An account's token, as sign-in returns it and a command acts on it. */
export interface GoogleToken extends GoogleTokenEntry {
    email: string;
}

/**
 * Every signed-in account of a service by its lower-cased email: the value of the service's token
 * secret, stored as a JSON object of the same shape.
 */
export type GoogleTokens = Map<string, GoogleTokenEntry>;

/**
 * Parses the value of the token secret `secretName`. No value (or an empty one) holds no account.
 * Anything else that is not the dictionary throws a `UsageError` naming the secret, never quoting
 * the value: it holds refresh tokens. Not side-effect free: sign-in calls it only for the throw.
 */
export function parseGoogleTokens(value: string | undefined, secretName: string): GoogleTokens {
    const tokens: GoogleTokens = new Map();
    if (!value) {
        return tokens;
    }

    const parsed = parseJson(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw malformed(secretName, 'it is not a JSON object of accounts by email');
    }

    for (const [email, entry] of Object.entries(parsed)) {
        const token = parseEntry(entry);
        if (!token || !email.includes('@') || email !== email.toLowerCase()) {
            throw malformed(
                secretName,
                'every key must be a lower-cased email holding { "refreshToken": string, "scopes": string[] }',
            );
        }

        tokens.set(email, token);
    }

    return tokens;
}

/**
 * The value to store in the token secret.
 * @__NO_SIDE_EFFECTS__
 */
export function serializeGoogleTokens(tokens: GoogleTokens): string {
    return JSON.stringify(Object.fromEntries(tokens));
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        // The parser's message quotes the value.
        return undefined;
    }
}

function parseEntry(entry: unknown): GoogleTokenEntry | undefined {
    if (typeof entry !== 'object' || entry === null || !('refreshToken' in entry) || !('scopes' in entry)) {
        return undefined;
    }

    const { refreshToken, scopes } = entry;
    if (typeof refreshToken !== 'string' || !refreshToken || !Array.isArray(scopes)) {
        return undefined;
    }

    const valid = scopes.filter((scope: unknown) => typeof scope === 'string');
    return valid.length === scopes.length ? { refreshToken, scopes: valid } : undefined;
}

function malformed(secretName: string, reason: string) {
    return new UsageError(
        `${secretName} does not hold Google tokens: ${reason}. ` +
            `Fix or clear it with \`secrets set ${secretName}\`, then sign in again.`,
    );
}
