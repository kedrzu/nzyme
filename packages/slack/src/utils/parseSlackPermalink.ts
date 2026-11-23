import { assert } from '@nzyme/utils/assert.js';

/**
 * What a Slack message permalink names: the channel and message it points at, and — only when the
 * permalink points at a reply — the ts of the message that opened the thread. `threadTs` absent
 * means the permalink names the message that opened the thread itself (or an unthreaded message),
 * so `ts` alone already names the thread root.
 */
export interface ParsedSlackPermalink {
    channelId: string;
    ts: string;
    threadTs: string | undefined;
}

const SLACK_PERMALINK_PATTERN = /^https:\/\/[\w-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)(?:\?(\S*))?$/;

/**
 * Parses a Slack message permalink into its channel, message timestamp and — for a reply — the
 * thread root's timestamp. Pure, and the only place that reads a permalink's shape: never
 * hand-assemble one instead, since a home-built link round-trips through this parser and only
 * fails once a human actually clicks it. `read` uses the result to pick between
 * `conversations.history` (no ts) and `conversations.replies` (anchored on `threadTs ?? ts`).
 * @__NO_SIDE_EFFECTS__
 */
export function parseSlackPermalink(url: string): ParsedSlackPermalink | undefined {
    const match = SLACK_PERMALINK_PATTERN.exec(url.trim());
    if (!match) {
        return undefined;
    }

    const [, channelId, tsDigits, query] = match;
    assert(channelId, 'permalink pattern matched without capturing a channel id');
    assert(tsDigits, 'permalink pattern matched without capturing a timestamp');

    return {
        channelId,
        ts: toTimestamp(tsDigits),
        threadTs: query ? (new URLSearchParams(query).get('thread_ts') ?? undefined) : undefined,
    };
}

/** A permalink's `p<digits>` component becomes a Slack timestamp by inserting a decimal point six
 *  digits from the end — Slack timestamps always carry microsecond precision. */
function toTimestamp(digits: string): string {
    return `${digits.slice(0, -6)}.${digits.slice(-6)}`;
}
