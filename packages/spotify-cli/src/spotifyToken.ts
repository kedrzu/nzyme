import { signInAgainError } from './utils/signInAgainError.js';

/** The value of the token secret: the one signed-in account. */
export interface SpotifyToken {
    refreshToken: string;
    /** The scopes Spotify granted at sign-in. */
    scopes: string[];
    /** The account's Spotify user id. */
    userId: string;
    /** When the account signed in, as an ISO date: the refresh token expires 6 months later. */
    signedInAt: string;
}

/** Params of {@link parseSpotifyToken}. */
export interface ParseSpotifyTokenParams {
    /** The raw value of the token secret; `undefined` when nothing is stored. */
    value: string | undefined;
    /** The token secret's name, for the message. */
    secretName: string;
    /** The command signing in, named in the message; see `signInAgainError`. */
    signInCommand: string | undefined;
}

/**
 * Parses the value of the token secret. No value, or anything that is not the token, throws the
 * sign-in-again `UsageError` naming the secret, never quoting the value: it holds a refresh token.
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyToken(params: ParseSpotifyTokenParams): SpotifyToken {
    const { value, secretName, signInCommand } = params;
    if (!value) {
        throw signInAgainError(`No Spotify account is signed in: ${secretName} is empty.`, signInCommand);
    }

    const token = readToken(parseJson(value));
    if (!token) {
        throw signInAgainError(
            `${secretName} does not hold a Spotify token ` +
                '(a JSON object { "refreshToken", "scopes", "userId", "signedInAt" }).',
            signInCommand,
        );
    }

    return token;
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        // The parser's message quotes the value.
        return undefined;
    }
}

function readToken(parsed: unknown): SpotifyToken | undefined {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return undefined;
    }

    if (!('refreshToken' in parsed && 'scopes' in parsed && 'userId' in parsed && 'signedInAt' in parsed)) {
        return undefined;
    }

    const { refreshToken, scopes, userId, signedInAt } = parsed;
    if (
        typeof refreshToken !== 'string' ||
        !refreshToken ||
        typeof userId !== 'string' ||
        !userId ||
        typeof signedInAt !== 'string' ||
        Number.isNaN(Date.parse(signedInAt)) ||
        !Array.isArray(scopes)
    ) {
        return undefined;
    }

    const valid = scopes.filter((scope: unknown) => typeof scope === 'string');
    return valid.length === scopes.length ? { refreshToken, scopes: valid, userId, signedInAt } : undefined;
}
