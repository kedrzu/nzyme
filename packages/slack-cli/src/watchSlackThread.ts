import { WebAPIPlatformError } from '@slack/web-api';

import { immutable } from '@nzyme/utils/immutable.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { SlackSignInRequiredError } from './SlackSignInRequiredError.js';

import type { SlackMessageRecord } from './formatSlackMessages.js';
import type { SlackConversationMessage, SlackReadClient } from './readSlackConversation.js';
import { toSlackMessageRecord } from './readSlackConversation.js';
import { selectMessagesAfter } from './selectMessagesAfter.js';

/** Default poll interval for `wait` and `send --wait`, overridable with `--poll`. */
export const DEFAULT_POLL_INTERVAL_SECONDS = 60;

/** Default deadline for `wait` and `send --wait`, overridable with `--timeout`. */
export const DEFAULT_TIMEOUT_SECONDS = 8 * 60 * 60;

/**
 * Bounds a single `conversations.replies` poll. `createSlackClient` already sets a 10s per-call
 * timeout with 2 retries, but a wait loop that runs unattended for up to 8 hours must not be able to
 * hang on one request even if that configuration ever changes underneath it — this is a second,
 * independent bound. Generous enough to outlast the SDK's own retries (up to ~3 attempts at 10s).
 */
const POLL_CALL_TIMEOUT_MS = 45_000;

/**
 * Slack error codes that mean the token itself is no longer usable — nothing later in the wait can
 * succeed either, so continuing only burns the caller's deadline for no chance of an answer.
 * `token_expired` belongs here because every poll already asks the auth (`defineSlackAuth`) for a fresh
 * token: an expired one reaching Slack means the refresh itself could not renew it. Every
 * other failure (a dropped connection, a laptop asleep, a momentarily slow Slack, rate limiting) is
 * transient: the wait must survive it and simply poll again, never report it as "nobody answered".
 */
const FATAL_AUTH_ERROR_CODES = immutable(
    new Set(['invalid_auth', 'token_revoked', 'account_inactive', 'token_expired']),
);

export interface WatchSlackThreadParams {
    /** Called once per poll: the wait outlives the user token (refreshed only once it nears expiry,
     *  hours before the default 8h deadline), so no client may be held across the whole wait. */
    getClient: () => Promise<SlackReadClient>;
    channelId: string;
    /** ts anchoring `conversations.replies` — the thread's root message. */
    threadTs: string;
    /** A message counts as a reply only once its ts compares strictly after this one. */
    baselineTs: string;
    pollIntervalMs: number;
    timeoutMs: number;
}

export type WatchSlackThreadResult = { outcome: 'replied'; message: SlackMessageRecord } | { outcome: 'timed_out' };

/**
 * Parses a `--poll`/`--timeout` value (seconds) into milliseconds, or returns `undefined` for
 * anything that isn't a positive number — shared by `wait` and `send --wait` so both reject a bad
 * value the same way.
 * @__NO_SIDE_EFFECTS__
 */
export function parseWaitSecondsToMs(value: string): number | undefined {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Polls a thread for the first message posted after `baselineTs` — what `wait` and `send --wait`
 * both block on. The deadline is computed once as a wall-clock instant and re-read from `Date.now()`
 * on every iteration, never accumulated from sleeps: a laptop that suspends for the night wakes up,
 * finds the deadline already past, and reports timed out immediately rather than having silently
 * "waited" through the suspend and then some.
 *
 * A transport failure (dropped connection, DNS hiccup, a slow Slack) is swallowed and retried on the
 * next iteration — it must never be mistaken for "no reply arrived". Only a fatal auth failure
 * (revoked/invalid/expired token, or a sign-in the auth (`defineSlackAuth`) says is needed) aborts the
 * wait, by rethrowing so the caller's own `resolveSlackFailure` handling reports it.
 */
export async function watchSlackThread(params: WatchSlackThreadParams): Promise<WatchSlackThreadResult> {
    const { pollIntervalMs, timeoutMs } = params;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
        const reply = await pollForReply(params);
        if (reply) {
            return { outcome: 'replied', message: reply };
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            return { outcome: 'timed_out' };
        }

        await Bun.sleep(Math.min(pollIntervalMs, remainingMs));
    }
}

type PollForReplyParams = Pick<WatchSlackThreadParams, 'getClient' | 'channelId' | 'threadTs' | 'baselineTs'>;

/** One bounded poll, on a client carrying a token fresh for this poll. Returns the earliest reply
 *  found, or `undefined` for "nothing yet" — which covers both a genuinely empty page and a swallowed
 *  transient error, deliberately indistinguishable to the caller since both mean "keep waiting". */
async function pollForReply(params: PollForReplyParams): Promise<SlackMessageRecord | undefined> {
    const { getClient, channelId, threadTs, baselineTs } = params;

    try {
        const client = await getClient();

        // `conversations.replies` takes no AbortSignal, so the call can only be abandoned on
        // timeout, not truly cancelled — still enough to stop the loop from hanging on it.
        const response = await withTimeout({
            timeoutMs: POLL_CALL_TIMEOUT_MS,
            operation: client.conversations.replies({ channel: channelId, ts: threadTs, oldest: baselineTs }),
        });

        // `oldest` already asks Slack to exclude the baseline itself, but the comparison is redone
        // locally with `selectMessagesAfter` rather than trusted blindly — the one place that decides
        // "is this a reply" stays the numerically-correct, unit-tested one.
        const reply = selectMessagesAfter(withDefinedTs(response.messages ?? []), baselineTs)[0];
        return reply && (await toSlackMessageRecord(client, channelId, reply));
    } catch (error) {
        if (isFatalAuthError(error) || error instanceof SlackSignInRequiredError) {
            throw error;
        }
        return undefined;
    }
}

/** `SlackConversationMessage.ts` is optional in the wire type; a message truly missing one cannot be
 *  ordered, so it is dropped rather than defaulted. */
function withDefinedTs(messages: SlackConversationMessage[]): (SlackConversationMessage & { ts: string })[] {
    return messages.filter((message): message is SlackConversationMessage & { ts: string } => message.ts != null);
}

function isFatalAuthError(error: unknown): boolean {
    return error instanceof WebAPIPlatformError && FATAL_AUTH_ERROR_CODES.has(error.data.error);
}
