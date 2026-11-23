import { assertNever } from '@nzyme/utils/assertNever.js';

import type { SlackPersonEntry } from '@nzyme/slack/utils/fetchSlackDirectory.js';

/** One rendered message, in the shape shared by `search`, `read` and (later) `wait` — enough to
 *  identify who sent it, read the full body, and jump straight to it in Slack. */
export interface SlackMessageRecord {
    ts: string;
    authorId: string | undefined;
    /** A name straight from the API — search's `username`, a bot's `bot_profile.name` — used only
     *  when the author id can't be resolved through the directory (a bot has no directory entry). */
    authorFallbackName: string | undefined;
    body: string;
    /** The canonical permalink Slack itself returned. Never hand-assembled — see
     *  `parseSlackPermalink`'s docs for why a home-built one is unsafe to emit. */
    permalink: string | undefined;
}

/**
 * How many messages a `search`/`read`/`wait` result left out beyond what it returned.
 * `search.messages` reports an exact total, so its caller always knows `exact`; `conversations.history`
 * / `conversations.replies` only ever say whether more exist, not how many, so their caller reports
 * `atLeast` — and since a read always keeps the newest messages, what an `atLeast` left out is
 * always the older end of the conversation. Either way this must be surfaced — see the
 * `formatSlackMessages` docs.
 */
export type SlackMessagesOmission =
    | { kind: 'none' }
    | { kind: 'exact'; count: number }
    | { kind: 'atLeast'; count: number };

export interface FormatSlackMessagesOptions {
    people: SlackPersonEntry[];
    omission: SlackMessagesOmission;
}

/**
 * Renders message records in the one shared plain-text format the whole `slack` reading surface
 * uses: a header line with time and author, the body verbatim, the permalink last. Appends a line
 * stating how many messages were left out whenever the result is truncated — the guarantee that a
 * cut-short read or search can never be handed back looking like the whole conversation.
 */
export function formatSlackMessages(records: SlackMessageRecord[], options: FormatSlackMessagesOptions): string[] {
    const blocks = records.map(record => formatMessageRecord(record, options.people));

    const omittedLine = formatOmittedLine(options.omission);
    if (omittedLine) {
        blocks.push(omittedLine);
    }

    return blocks;
}

function formatMessageRecord(record: SlackMessageRecord, people: SlackPersonEntry[]): string {
    const header = `[${formatTimestamp(record.ts)}] ${resolveAuthorName(record, people)}`;
    const permalinkLine = record.permalink ?? '(no permalink)';
    return `${header}\n${record.body}\n${permalinkLine}`;
}

function resolveAuthorName(record: SlackMessageRecord, people: SlackPersonEntry[]): string {
    const person = record.authorId ? people.find(entry => entry.id === record.authorId) : undefined;
    if (person) {
        return person.displayName ?? person.realName ?? person.firstName ?? person.handle;
    }
    return record.authorFallbackName ?? record.authorId ?? 'unknown sender';
}

function formatTimestamp(ts: string): string {
    const date = new Date(Number(ts) * 1000);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatOmittedLine(omission: SlackMessagesOmission): string | undefined {
    switch (omission.kind) {
        case 'none':
            return undefined;
        case 'exact':
            return `… ${omission.count} more ${plural(omission.count, 'message')} omitted.`;
        case 'atLeast': {
            const verb = omission.count === 1 ? 'exists' : 'exist';
            return `… at least ${omission.count} more ${plural(omission.count, 'message')} ${verb} earlier in this conversation (raise --limit to see them).`;
        }
        default:
            return assertNever(omission, 'Unhandled Slack messages omission kind');
    }
}

function plural(count: number, noun: string): string {
    return count === 1 ? noun : `${noun}s`;
}
