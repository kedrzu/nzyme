import type { OAuth2Client } from 'google-auth-library';

/**
 * A Google API a command set signs in to. The CLI supplies it, so this package never imports an API
 * client.
 */
export interface GoogleService {
    /** Upper-case name the messages call the service by. */
    name: 'DRIVE' | 'GMAIL';
    /** The scopes sign-in requests; every one must be granted. */
    scopes: readonly string[];
    /**
     * Reads the email address of the signed-in account through the API.
     * @param rootUrl The API root to call instead of Google's, from `GoogleEndpoints` (tests).
     */
    resolveEmail(auth: OAuth2Client, rootUrl: string | undefined): Promise<string>;
}
