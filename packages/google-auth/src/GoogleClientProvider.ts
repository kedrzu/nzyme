/** An OAuth client of the Google Cloud project: a Desktop-app client id and its secret. */
export interface GoogleClientCredentials {
    clientId: string;
    clientSecret: string;
}

/**
 * The product's service giving the OAuth client an account signs in and refreshes with. Which client
 * serves which account is the product's decision; the stored token does not record it, so a refresh
 * must get the client the account signed in with.
 */
export interface GoogleClientProvider {
    /**
     * The client for `email`. `email` is unset for a sign-in without `--login-hint`. Throw a
     * `UsageError` saying what is missing when there is none.
     */
    getClient(email: string | undefined): Promise<GoogleClientCredentials>;
}
