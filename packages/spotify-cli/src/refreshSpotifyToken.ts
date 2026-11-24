import { SpotifyError } from './SpotifyError.js';
import type { SpotifyGrantedToken } from './utils/requestSpotifyToken.js';
import { requestSpotifyToken } from './utils/requestSpotifyToken.js';
import { signInAgainError } from './utils/signInAgainError.js';

/** Params of {@link refreshSpotifyToken}. */
export interface RefreshSpotifyTokenParams {
    accountsUrl: string;
    clientId: string;
    refreshToken: string;
    /** The command signing in, named when Spotify rejects the refresh token; see `signInAgainError`. */
    signInCommand: string | undefined;
}

/**
 * Trades the refresh token for an access token. `invalid_grant` (the token is revoked or past its 6
 * months) throws the sign-in-again `UsageError`; any other refusal a `SpotifyError`. The result's
 * `refreshToken` is set when Spotify rotated it: the caller must store it.
 */
export async function refreshSpotifyToken(params: RefreshSpotifyTokenParams): Promise<SpotifyGrantedToken> {
    const result = await requestSpotifyToken({
        accountsUrl: params.accountsUrl,
        form: { grant_type: 'refresh_token', refresh_token: params.refreshToken, client_id: params.clientId },
    });
    if (result.ok) {
        return result.token;
    }

    if (result.error === 'invalid_grant') {
        throw signInAgainError(
            'Spotify rejected the stored refresh token (revoked, or older than the 6 months a sign-in lasts).',
            params.signInCommand,
        );
    }

    throw new SpotifyError({ operation: 'token refresh', status: result.status });
}
