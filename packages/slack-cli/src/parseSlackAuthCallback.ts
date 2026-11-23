/** What one request to the local callback server means for the authorization in progress. */
export type SlackAuthCallback =
    /** Not the callback at all — a favicon or a stray request. Answer 404 and keep waiting. */
    | { kind: 'ignored' }
    /** A callback this run did not start. Refuse it and keep waiting for the real one. */
    | { kind: 'foreign' }
    /** The developer declined, or Slack refused the request. */
    | { kind: 'denied'; error: string }
    /** The authorization code to exchange. */
    | { kind: 'code'; code: string };

/** Parameters for {@link parseSlackAuthCallback}. */
export interface ParseSlackAuthCallbackParams {
    /** The URL of the request the callback server received. */
    url: URL;
    /** The `state` sent in the authorize URL. */
    state: string;
    /** The path of the redirect URI. */
    callbackPath: string;
}

/**
 * Classifies a request to the local callback server. The `state` check is what keeps a request this
 * run did not start — another tab, a replayed URL — from being exchanged as if it were ours, so it is
 * checked before anything else in the query is believed.
 * @__NO_SIDE_EFFECTS__
 */
export function parseSlackAuthCallback(params: ParseSlackAuthCallbackParams): SlackAuthCallback {
    const { url } = params;
    if (url.pathname !== params.callbackPath) {
        return { kind: 'ignored' };
    }

    if (url.searchParams.get('state') !== params.state) {
        return { kind: 'foreign' };
    }

    const error = url.searchParams.get('error');
    if (error) {
        return { kind: 'denied', error };
    }

    const code = url.searchParams.get('code');
    if (!code) {
        return { kind: 'denied', error: 'no code in the callback' };
    }

    return { kind: 'code', code };
}
