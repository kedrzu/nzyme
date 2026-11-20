import { OAuth2Client } from 'google-auth-library';

import type { GoogleClientCredentials } from '../GoogleClientProvider.js';

/**
 * An OAuth client of `credentials`, without tokens.
 * @param tokenUrl The token endpoint to use instead of Google's (tests).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function createOAuthClient(credentials: GoogleClientCredentials, tokenUrl: string | undefined) {
    return new OAuth2Client({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        endpoints: tokenUrl ? { oauth2TokenUrl: tokenUrl } : {},
    });
}
