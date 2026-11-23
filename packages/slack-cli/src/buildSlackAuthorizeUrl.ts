/** Parameters for {@link buildSlackAuthorizeUrl}. */
export interface BuildSlackAuthorizeUrlParams {
    /** The Slack app's OAuth client id. */
    clientId: string;
    /** User scopes to request — the developer's token; no bot scopes. */
    userScopes: string[];
    /** The `localhost` redirect registered on the Slack app. */
    redirectUri: string;
    /** Unguessable value the callback must echo back. */
    state: string;
    /** The PKCE challenge of this run; its verifier goes only into the code exchange. */
    codeChallenge: string;
}

/**
 * Builds the URL that asks the developer to authorize the Slack app for a user token. Only
 * `user_scope` is requested: Slack refuses bot scopes on a desktop (`localhost`) redirect.
 * @__NO_SIDE_EFFECTS__
 */
export function buildSlackAuthorizeUrl(params: BuildSlackAuthorizeUrlParams): string {
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('user_scope', params.userScopes.join(','));
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
}
