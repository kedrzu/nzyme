import { WebAPIHTTPError, WebAPIPlatformError, WebAPIRequestError } from '@slack/web-api';

import type { SlackAuthOptions } from './SlackAuthOptions.js';
import { SlackSignInRequiredError } from './SlackSignInRequiredError.js';

/**
 * The closed exit-code set every `slack` command returns. Durable across the whole command group —
 * `send`/`wait` return {@link SLACK_EXIT_CODE.WAIT_TIMED_OUT} themselves, and
 * {@link resolveSlackFailure} returns {@link SLACK_EXIT_CODE.INVALID_ARGUMENTS} for a caller-fault
 * Slack rejection (see {@link CALLER_FAULT_SLACK_ERRORS}) in addition to the caller-detected cases
 * below.
 */
export const SLACK_EXIT_CODE = {
    /** Done, including a zero-result outcome. */
    SUCCESS: 0,
    /** Not the caller's fault: missing token, revoked/invalid token, or Slack unreachable. */
    UNAVAILABLE: 1,
    /** A wait deadline elapsed with no reply. */
    WAIT_TIMED_OUT: 2,
    /** Fix your arguments: target not resolved/ambiguous, broadcast refused, empty body, or a
     *  target Slack itself rejected (not joined, archived, unknown id), or a message Slack refuses
     *  to change. */
    INVALID_ARGUMENTS: 3,
} as const;

export type SlackExitCode = (typeof SLACK_EXIT_CODE)[keyof typeof SLACK_EXIT_CODE];

/** An exit code paired with the message a command should print to explain it. */
export interface SlackFailure {
    exitCode: SlackExitCode;
    message: string;
}

/**
 * A user token holds `chat:write` but never the bot-only `chat:write.public`, so it can only post to
 * a channel the caller has joined, and any command can be given a well-formed but wrong id
 * (`resolveSlackTarget` resolves an id-shaped target without verifying it exists). Both surface as a
 * `WebAPIPlatformError` — the caller's mistake, not a bad token — so they must not tell the caller to
 * go check the token.
 *
 * `thread_not_found` and `message_not_found` are drawn by the lookup that resolves a permalink
 * (`conversations.replies`) — the same step plain `read` uses, and the one `edit` runs before it
 * ever reaches `chat.update` — not by `chat.update` itself. `cant_update_message` and
 * `edit_window_closed` are `chat.update`'s own rejections. Same reasoning throughout: a deleted
 * message or thread is a stale permalink, not a broken token, and sending the developer to inspect
 * his token would be pointing at the wrong thing.
 *
 * Keyed by the Slack platform error code (`error.data.error`); the value is the plain-English
 * remedy `resolveSlackFailure` appends after it. Anything not listed here — including genuine
 * auth failures like `invalid_auth`, `not_authed`, `token_revoked`, `missing_scope` — keeps the
 * default UNAVAILABLE/token-check path below.
 */
const CALLER_FAULT_SLACK_ERRORS: Readonly<Record<string, string>> = {
    not_in_channel:
        'the developer has not joined that channel — join it yourself, or ask a member of the channel to invite you, then retry.',
    channel_not_found: 'no channel matches that id — check it for a typo, then retry.',
    user_not_found: 'no user matches that id — check it for a typo, then retry.',
    is_archived: 'that channel is archived and no longer accepts messages — pick a different one.',
    message_not_found:
        'no message is there any more — it was most likely deleted, so re-read the conversation to get a current permalink.',
    thread_not_found:
        'the thread that message belonged to is gone — it was most likely deleted, so re-read the conversation to get a current permalink.',
    cant_update_message:
        'Slack will not let this token change that message — only the account that posted it can edit it.',
    edit_window_closed:
        "that message is older than the workspace's edit time limit and can no longer be changed — post a correction into its thread instead.",
};

/** What {@link resolveSlackFailure} names in its remedies: the token secret and the sign-in command. */
export type SlackFailureAuth = Pick<SlackAuthOptions, 'token' | 'signInCommand'>;

/**
 * Maps a caught error from a `slack` command to the exit code it must report and an actionable
 * message. Exists so a missing/revoked token, an unreachable Slack API, or a caller mistake Slack
 * itself rejected surfaces as a one-line explanation instead of a raw SDK error and stack trace —
 * the base `Command.catch()` of `@nzyme/cli-core` always exits 1 on a thrown error, but logs the full stack, which is fine for a genuine bug
 * and unhelpful for an expected, actionable failure like these.
 *
 * Returns `null` for an error this mapping does not recognise, so the caller can rethrow it and let
 * that default path (exit 1, logged with a stack trace) handle the genuinely unexpected case.
 */
export function resolveSlackFailure(error: unknown, auth: SlackFailureAuth): SlackFailure | null {
    if (error instanceof WebAPIPlatformError) {
        const callerFaultRemedy = CALLER_FAULT_SLACK_ERRORS[error.data.error];
        if (callerFaultRemedy != null) {
            return {
                exitCode: SLACK_EXIT_CODE.INVALID_ARGUMENTS,
                message: `Slack rejected the request (${error.data.error}): ${callerFaultRemedy}`,
            };
        }

        // Every command takes its token from the Slack auth service, which refreshes it before it
        // expires — an expired one reaching Slack means the refresh failed, and only signing in again
        // issues a new one.
        if (error.data.error === 'token_expired') {
            return {
                exitCode: SLACK_EXIT_CODE.UNAVAILABLE,
                message: `Slack rejected the request (token_expired): run \`${auth.signInCommand}\`, then retry.`,
            };
        }

        return {
            exitCode: SLACK_EXIT_CODE.UNAVAILABLE,
            message:
                `Slack rejected the request (${error.data.error}). Check that ${auth.token.name} is still valid and ` +
                "has not been revoked in Slack's app settings, then retry.",
        };
    }

    if (error instanceof WebAPIHTTPError) {
        return {
            exitCode: SLACK_EXIT_CODE.UNAVAILABLE,
            message: `Slack API is unreachable (HTTP ${error.statusCode}). Check your network connection and retry.`,
        };
    }

    if (error instanceof WebAPIRequestError) {
        return {
            exitCode: SLACK_EXIT_CODE.UNAVAILABLE,
            message: `Could not reach the Slack API: ${error.original.message}. Check your network connection and retry.`,
        };
    }

    if (error instanceof SlackSignInRequiredError) {
        return { exitCode: SLACK_EXIT_CODE.UNAVAILABLE, message: error.message };
    }

    return null;
}
