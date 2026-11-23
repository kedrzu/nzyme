import { assert } from '@nzyme/utils/assert.js';

/**
 * The shape a `slack` command target can take, recognised without ever calling Slack. `id` and
 * `permalink` carry everything needed to resolve for free; `channelName`, `handle` and `email` name
 * something specific but still need a directory lookup; `text` is a free-form query across both
 * people and channels at once — the shape a caller reaches for when it does not yet know whether
 * "Frank" or "the developers" names a person or a channel.
 */
export type ParsedSlackTarget =
    | { kind: 'id'; id: string }
    | { kind: 'permalink'; channelId: string; url: string }
    | { kind: 'channelName'; name: string }
    | { kind: 'handle'; handle: string }
    | { kind: 'email'; email: string }
    | { kind: 'text'; text: string };

/**
 * Slack ids are uppercase alphanumeric, several characters long, and always mix letters with at
 * least one digit (e.g. `U0APV67CQKT`, `T0ANWNQ4JR1`). The digit requirement keeps a genuine
 * all-caps word — someone searching `slack people CONTRACTORS` — from being misread as an id: the
 * prefix set below matches its `C`, but no plain English word carries a digit.
 */
const SLACK_ID_PATTERN = /^[UWCGDTS](?=[A-Z0-9]*\d)[A-Z0-9]{7,}$/;

/**
 * A Slack message permalink, e.g. `https://sigma-health.slack.com/archives/C0123/p1700000000000`,
 * optionally with a `?thread_ts=...` query string. The channel id sits right in the path, so it can
 * be read out without a Slack call — only the message-level shape (thread vs reply) is deferred to
 * `parseSlackPermalink` in the `read`/`search` commands.
 */
const SLACK_PERMALINK_PATTERN = /^https:\/\/[\w-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p\d+(?:\?\S*)?$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Classifies the shape of a `slack` target argument — id, permalink, `#name`, `@handle`, email, or
 * free text — without ever touching Slack. Only `resolveSlackTarget` turns a name-shaped target into
 * an actual id, and only it needs a live client.
 * @__NO_SIDE_EFFECTS__
 */
export function parseSlackTarget(input: string): ParsedSlackTarget {
    const trimmed = input.trim();

    const permalinkMatch = SLACK_PERMALINK_PATTERN.exec(trimmed);
    if (permalinkMatch) {
        const [, channelId] = permalinkMatch;
        assert(channelId, 'permalink pattern matched without capturing a channel id');
        return { kind: 'permalink', channelId, url: trimmed };
    }
    if (SLACK_ID_PATTERN.test(trimmed)) {
        return { kind: 'id', id: trimmed };
    }
    if (trimmed.startsWith('#') && trimmed.length > 1) {
        return { kind: 'channelName', name: trimmed.slice(1) };
    }
    if (trimmed.startsWith('@') && trimmed.length > 1) {
        return { kind: 'handle', handle: trimmed.slice(1) };
    }
    if (EMAIL_PATTERN.test(trimmed)) {
        return { kind: 'email', email: trimmed };
    }
    return { kind: 'text', text: trimmed };
}
