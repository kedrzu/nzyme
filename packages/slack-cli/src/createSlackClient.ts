import { WebClient } from '@slack/web-api';

import type { SlackAuthShape } from './defineSlackAuth.js';

/**
 * Retries the Slack SDK attempts before giving up on a single call. The SDK's default policy
 * (`tenRetriesInAboutThirtyMinutes`) can keep one call in flight for around 30 minutes, which would
 * swallow the poll interval a waiting command relies on to notice a reply promptly — a couple of quick
 * retries is enough for an interactive CLI.
 */
const MAX_RETRIES = 2;

/**
 * Per-call timeout in milliseconds. The SDK's default (`timeout: 0`) never times out a hung request,
 * which would leave a command stuck forever with no feedback.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The Slack Web API client acting as the developer: authenticated with their own user token, refreshed
 * first when Slack is about to rotate it, never a bot — the agent acts in conversations the developer
 * can see.
 */
export async function createSlackClient(auth: SlackAuthShape): Promise<WebClient> {
    const token = await auth.get();

    return new WebClient(token, {
        retryConfig: { retries: MAX_RETRIES },
        timeout: REQUEST_TIMEOUT_MS,
    });
}
