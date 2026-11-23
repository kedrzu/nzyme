import type {
    ChatGetPermalinkArguments,
    ChatGetPermalinkResponse,
    ConversationsHistoryResponse,
    ConversationsRepliesArguments,
    ConversationsRepliesResponse,
} from '@slack/web-api';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { SlackReadClient } from './readSlackConversation.js';
import { readSlackConversation } from './readSlackConversation.js';

const CHANNEL_ID = 'C01ENGPLAT';
const THREAD_TS = '1700000000.000000';
const THREAD_PERMALINK = `https://sigma-health.slack.com/archives/${CHANNEL_ID}/p1700000003000000?thread_ts=${THREAD_TS}`;

/** A message `n` seconds into the conversation — `ts` doubles as the assertion handle. */
function message(offsetSeconds: number) {
    return { ts: `${1700000000 + offsetSeconds}.000000`, user: 'U02FR4NK1', text: `message ${offsetSeconds}` };
}

let historyResponse: ConversationsHistoryResponse;
let repliesPages: ConversationsRepliesResponse[];
let repliesCursors: (string | undefined)[];
let client: SlackReadClient;

beforeEach(() => {
    historyResponse = { ok: true, messages: [] };
    repliesPages = [{ ok: true, messages: [] }];
    repliesCursors = [];

    client = {
        users: {
            list: () => Promise.resolve({ ok: true, members: [] }),
            lookupByEmail: () => Promise.resolve({ ok: true }),
        },
        conversations: {
            list: () => Promise.resolve({ ok: true, channels: [] }),
            history: () => Promise.resolve(historyResponse),
            replies: (options: ConversationsRepliesArguments) => {
                repliesCursors.push(options.cursor);
                const page = repliesPages.shift();
                expect(page).toBeDefined();
                return Promise.resolve(page ?? { ok: true, messages: [] });
            },
        },
        chat: {
            getPermalink: (options: ChatGetPermalinkArguments) =>
                Promise.resolve({
                    ok: true,
                    permalink: `https://slack.test/${options.message_ts}`,
                } satisfies ChatGetPermalinkResponse),
        },
    };
});

/** The ts of every message in the page, in printed order. */
async function readTimestamps(target: string, limit: number) {
    const result = await readSlackConversation({ client, target, limit });
    expect(result.outcome).toBe('read');
    if (result.outcome !== 'read') {
        throw new Error('expected a read outcome');
    }
    return { timestamps: result.messages.map(record => record.ts), omission: result.omission };
}

describe('readSlackConversation — channel history', () => {
    test('prints chronologically even though Slack returns history newest-first', async () => {
        historyResponse = { ok: true, messages: [message(2), message(1), message(0)] };

        const { timestamps, omission } = await readTimestamps(CHANNEL_ID, 5);

        expect(timestamps).toEqual([message(0).ts, message(1).ts, message(2).ts]);
        expect(omission).toEqual({ kind: 'none' });
    });

    test('keeps the newest messages and reports the omission when capped by the limit', async () => {
        historyResponse = { ok: true, messages: [message(3), message(2), message(1)], has_more: true };

        const { timestamps, omission } = await readTimestamps(CHANNEL_ID, 2);

        expect(timestamps).toEqual([message(2).ts, message(3).ts]);
        expect(omission).toEqual({ kind: 'atLeast', count: 1 });
    });
});

describe('readSlackConversation — thread', () => {
    test('prints the whole thread, parent first, when it fits within the limit', async () => {
        repliesPages = [{ ok: true, messages: [message(0), message(1), message(2)] }];

        const { timestamps, omission } = await readTimestamps(THREAD_PERMALINK, 5);

        expect(timestamps).toEqual([message(0).ts, message(1).ts, message(2).ts]);
        expect(omission).toEqual({ kind: 'none' });
        expect(repliesCursors).toEqual([undefined]);
    });

    // The regression this file exists for: `conversations.replies` pages from the thread's opening
    // message, so reading only its first page hands back the START of a long thread — an agent asking
    // what was decided would report the opening of the argument as its conclusion.
    test('walks the cursor to the end and keeps the newest replies, not the oldest', async () => {
        repliesPages = [
            {
                ok: true,
                messages: [message(0), message(1), message(2), message(3)],
                response_metadata: { next_cursor: 'page-2' },
            },
            // Slack repeats the thread parent at the head of every page.
            { ok: true, messages: [message(0), message(4), message(5)], response_metadata: { next_cursor: '' } },
        ];

        const { timestamps, omission } = await readTimestamps(THREAD_PERMALINK, 3);

        expect(timestamps).toEqual([message(3).ts, message(4).ts, message(5).ts]);
        expect(omission).toEqual({ kind: 'atLeast', count: 1 });
        expect(repliesCursors).toEqual([undefined, 'page-2']);
    });

    test('does not repeat the parent message a paginated thread returns on every page', async () => {
        repliesPages = [
            { ok: true, messages: [message(0), message(1)], response_metadata: { next_cursor: 'page-2' } },
            { ok: true, messages: [message(0), message(2)] },
        ];

        const { timestamps } = await readTimestamps(THREAD_PERMALINK, 10);

        expect(timestamps).toEqual([message(0).ts, message(1).ts, message(2).ts]);
    });
});
