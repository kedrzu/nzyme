/** Params of {@link requestSpotifyToken}. */
export interface RequestSpotifyTokenParams {
    /** The accounts service root; the token endpoint is its `/api/token`. */
    accountsUrl: string;
    /** The form fields of the grant: `grant_type`, `client_id` and the grant's own. */
    form: Record<string, string>;
}

/** What the token endpoint granted. */
export interface SpotifyGrantedToken {
    accessToken: string;
    /** Returned on a code exchange, and on a refresh only when Spotify rotates it. */
    refreshToken: string | undefined;
    /** The granted scopes, space-separated. */
    scope: string;
}

/** The token endpoint's answer: the grant, or the status and the OAuth `error` code of a refusal. */
export type SpotifyTokenResult =
    | { ok: true; token: SpotifyGrantedToken }
    | { ok: false; status: number; error: string | undefined };

/**
 * Posts a grant to Spotify's token endpoint (PKCE: the client id, no secret). Only the token fields
 * and the OAuth `error` code are read from the answer, so nothing else of it can reach a message.
 */
export async function requestSpotifyToken(params: RequestSpotifyTokenParams): Promise<SpotifyTokenResult> {
    const response = await fetch(`${params.accountsUrl}/api/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params.form),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const record = new Map<string, unknown>(typeof body === 'object' && body !== null ? Object.entries(body) : []);

    const accessToken = record.get('access_token');
    if (!response.ok || typeof accessToken !== 'string' || !accessToken) {
        const error = record.get('error');
        // A code, never free text: anything else is dropped rather than quoted.
        const code = typeof error === 'string' && /^[a-z_]{1,64}$/.test(error) ? error : undefined;
        return { ok: false, status: response.status, error: code };
    }

    const refreshToken = record.get('refresh_token');
    const scope = record.get('scope');
    return {
        ok: true,
        token: {
            accessToken,
            refreshToken: typeof refreshToken === 'string' && refreshToken ? refreshToken : undefined,
            scope: typeof scope === 'string' ? scope : '',
        },
    };
}
