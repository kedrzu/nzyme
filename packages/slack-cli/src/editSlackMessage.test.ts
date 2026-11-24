import type { ChatUpdateArguments, ConversationsRepliesArguments, ConversationsRepliesResponse } from '@slack/web-api';
import { beforeEach, describe, expect, test } from 'bun:test';

import { assert } from '@nzyme/utils/assert.js';

import type { SlackEditClient } from './editSlackMessage.js';
import { editSlackMessage } from './editSlackMessage.js';

const CHANNEL_ID = 'C0ANMLVNB4P';
const TS = '1776941567.209589';
const PERMALINK = `https://healedcare.slack.com/archives/${CHANNEL_ID}/p1776941567209589`;
/** ts of the message that opened the thread {@link TS} is a reply in. */
const PARENT_TS = '1776941500.100000';
const REPLY_PERMALINK = `${PERMALINK}?thread_ts=${PARENT_TS}`;

const OWNER_ID = 'U0APV67CQKT';
/** Any `app_id` proves the message went out through the API; the check is presence, never equality
 *  with a hard-coded id — `auth.test` on a user token reports no app id to compare against. */
const APP_ID = 'A0B2N94Q1DF';
const TASK_LINK = { id: 'HLD-530', url: 'https://linear.app/healed/issue/HLD-530' };

/** A message as Slack hands back one the agent posted: authored by the token owner, with an
 *  `app_id`. Spread with an override to build the messages that must be refused. */
const AGENT_MESSAGE = { ts: TS, user: OWNER_ID, app_id: APP_ID, text: 'the body as first posted' };

const NEW_BODY = 'Rewritten: the retention control covers the management account too.';

let repliesResponse: ConversationsRepliesResponse;
let repliesCalls: ConversationsRepliesArguments[];
let updateCalls: ChatUpdateArguments[];
let client: SlackEditClient;

beforeEach(() => {
    repliesResponse = { ok: true, messages: [AGENT_MESSAGE] };
    repliesCalls = [];
    updateCalls = [];

    client = {
        conversations: {
            replies: (options: ConversationsRepliesArguments) => {
                repliesCalls.push(options);
                return Promise.resolve(repliesResponse);
            },
        },
        chat: {
            update: (options: ChatUpdateArguments) => {
                updateCalls.push(options);
                return Promise.resolve({ ok: true });
            },
        },
    };
});

function edit(permalink = PERMALINK, body = NEW_BODY) {
    return editSlackMessage({ client, permalink, body, ownerId: OWNER_ID, taskLink: TASK_LINK });
}

/** The footer of what `chat.update` was last given — always the last block. `ChatUpdateArguments` is
 *  a union over text-only, blocks and attachments payloads, so `blocks` only reads after narrowing
 *  to the variant carrying them. */
function updatedFooter() {
    const call = updateCalls.at(-1);
    assert(call && 'blocks' in call && call.blocks, 'expected a chat.update call carrying blocks');
    return call.blocks.at(-1);
}

describe('editSlackMessage', () => {
    test('rewrites a top-level agent message, footer and all, and reports the ids it was given', async () => {
        const result = await edit();

        expect(result).toEqual({ outcome: 'edited', channelId: CHANNEL_ID, ts: TS });
        expect(repliesCalls).toEqual([{ channel: CHANNEL_ID, ts: TS, limit: 1 }]);
        expect(updateCalls).toEqual([
            {
                channel: CHANNEL_ID,
                ts: TS,
                text: `🤖 AI agent writing on behalf of <@${OWNER_ID}>\n${NEW_BODY}`,
                blocks: [
                    { type: 'markdown', text: NEW_BODY },
                    { type: 'divider' },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text:
                                    `🤖 AI agent writing on behalf of <@${OWNER_ID}> · ` +
                                    'Reply in this thread, that is the only place the agent reads. · ' +
                                    '<https://linear.app/healed/issue/HLD-530|HLD-530>',
                            },
                        ],
                    },
                ],
            },
        ]);
    });

    // Must protect: the reply keeps the short footer, so an edit does not repeat the reply
    // instruction and the task link halfway down a thread.
    test('a thread reply is rewritten with the short footer', async () => {
        repliesResponse = {
            ok: true,
            // Slack returns the anchored reply alongside the message that opened the thread.
            messages: [
                { ts: PARENT_TS, user: OWNER_ID, app_id: APP_ID, thread_ts: PARENT_TS, text: 'the question' },
                { ...AGENT_MESSAGE, thread_ts: PARENT_TS },
            ],
        };

        const result = await edit(REPLY_PERMALINK);

        expect(result).toEqual({ outcome: 'edited', channelId: CHANNEL_ID, ts: TS });
        expect(updateCalls[0]?.ts).toBe(TS);
        expect(updatedFooter()).toEqual({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `🤖 AI agent writing on behalf of <@${OWNER_ID}>` }],
        });
    });

    // A thread's opening message carries a `thread_ts` equal to its own ts once somebody replies —
    // reading that as "this is a reply" would silently strip the full footer off the message that
    // needs it most.
    test('a thread parent that has replies keeps the full footer', async () => {
        repliesResponse = {
            ok: true,
            messages: [
                { ...AGENT_MESSAGE, thread_ts: TS },
                { ts: '1776941600.000000', user: 'U02FR4NK1', thread_ts: TS, text: 'an answer' },
            ],
        };

        await edit();

        expect(updateCalls[0]?.ts).toBe(TS);
        expect(updatedFooter()).toEqual({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text:
                        `🤖 AI agent writing on behalf of <@${OWNER_ID}> · ` +
                        'Reply in this thread, that is the only place the agent reads. · ' +
                        '<https://linear.app/healed/issue/HLD-530|HLD-530>',
                },
            ],
        });
    });

    // Must protect: the token is the developer's own, so somebody else's message must not even be
    // offered to Slack for rewriting.
    test('refuses a message written by someone else, without calling chat.update', async () => {
        repliesResponse = { ok: true, messages: [{ ...AGENT_MESSAGE, user: 'U02FR4NK1' }] };

        const result = await edit();

        expect(result).toEqual({ outcome: 'not_agent_message' });
        expect(updateCalls).toEqual([]);
    });

    // Must protect: a message the developer typed in his Slack client has no `app_id`, and is his
    // writing, not the agent's.
    test('refuses a message that never went through the API, without calling chat.update', async () => {
        repliesResponse = { ok: true, messages: [{ ts: TS, user: OWNER_ID, text: 'something I typed myself' }] };

        const result = await edit();

        expect(result).toEqual({ outcome: 'not_agent_message' });
        expect(updateCalls).toEqual([]);
    });

    test('refuses a permalink it cannot parse, without calling Slack at all', async () => {
        const result = await edit('https://healedcare.slack.com/archives/C0ANMLVNB4P');

        expect(result).toEqual({ outcome: 'invalid_permalink' });
        expect(repliesCalls).toEqual([]);
        expect(updateCalls).toEqual([]);
    });

    test('reports a message that is gone', async () => {
        repliesResponse = { ok: true, messages: [] };

        const result = await edit();

        expect(result).toEqual({ outcome: 'message_not_found' });
        expect(updateCalls).toEqual([]);
    });

    // Slack answers an anchor it no longer has with the surrounding thread rather than nothing, so
    // matching the exact ts is what keeps an edit off a message the caller never named.
    test('reports not found when the response carries only other messages', async () => {
        repliesResponse = { ok: true, messages: [{ ...AGENT_MESSAGE, ts: PARENT_TS }] };

        const result = await edit();

        expect(result).toEqual({ outcome: 'message_not_found' });
        expect(updateCalls).toEqual([]);
    });

    // Must protect: the content rules of `send` hold for an edit too — an empty body would leave a
    // bare footer behind.
    test('refuses an empty body', async () => {
        const result = await edit(PERMALINK, '   \n\t ');

        expect(result).toEqual({ outcome: 'empty_body' });
        expect(updateCalls).toEqual([]);
    });

    test('refuses a body containing a broadcast mention', async () => {
        const result = await edit(PERMALINK, 'Correction for @channel');

        expect(result).toEqual({ outcome: 'broadcast_mention' });
        expect(updateCalls).toEqual([]);
    });
});
