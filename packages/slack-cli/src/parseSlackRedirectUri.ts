import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/** Where the local callback server of a Slack sign-in listens. */
export interface SlackRedirect {
    port: number;
    /** The path of the redirect, e.g. `/callback`. */
    path: string;
}

/**
 * The port and path of a Slack redirect URI. Throws unless it is `http://localhost:<port><path>`:
 * Slack treats plain HTTP as a desktop redirect only on `localhost`, and the browser following it
 * keeps the code on this machine.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSlackRedirectUri(redirectUri: string): SlackRedirect {
    const url = URL.parse(redirectUri);
    if (!url || url.protocol !== 'http:' || url.hostname !== 'localhost' || !url.port) {
        throw new ApplicationError('The Slack redirect URI must be http://localhost:<port><path>', { redirectUri });
    }

    return { port: Number(url.port), path: url.pathname };
}
