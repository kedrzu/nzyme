import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** What a Slack sign-in or refresh issued for the developer. */
export interface SlackUserTokenGrant {
    accessToken: string;
    refreshToken: string;
    /** Seconds the access token lives. */
    expiresIn: number;
}

/**
 * The user-token grant in an `oauth.v2.access` answer, or `null` unless it carries all of it. Slack
 * puts it under `authed_user` on sign-in and at the top level on refresh; pass the object holding it.
 * @__NO_SIDE_EFFECTS__
 */
export function readSlackUserTokenGrant(answer: unknown): SlackUserTokenGrant | null {
    if (!isPlainObject(answer)) {
        return null;
    }

    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = answer;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof expiresIn !== 'number') {
        return null;
    }

    return { accessToken, refreshToken, expiresIn };
}
