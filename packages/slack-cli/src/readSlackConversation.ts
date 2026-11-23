import type { WebClient } from '@slack/web-api';

import { extractSlackMessageBody } from '@nzyme/slack/utils/extractSlackMessageBody.js';
import type { SlackApiBlock } from '@nzyme/slack/utils/extractSlackMessageBody.js';
import type { SlackDirectoryClient } from '@nzyme/slack/utils/fetchSlackDirectory.js';
import { parseSlackPermalink } from '@nzyme/slack/utils/parseSlackPermalink.js';
import { parseSlackTarget } from '@nzyme/slack/utils/parseSlackTarget.js';
import { resolveSlackTarget } from '@nzyme/slack/utils/resolveSlackTarget.js';
import type { ResolvedSlackTarget, ResolveSlackTargetResult } from '@nzyme/slack/utils/resolveSlackTarget.js';
import { assert } from '@nzyme/utils/assert.js';

import type { SlackMessageRecord, SlackMessagesOmission } from './formatSlackMessages.js';

/** The subset of `WebClient` reading a conversation needs — narrow enough that a test can pass a
 *  plain fake. Extends the directory client since resolving a target needs it too. */
export interface SlackReadClient extends SlackDirectoryClient {
    conversations: SlackDirectoryClient['conversations'] & Pick<WebClient['conversations'], 'history' | 'replies'>;
    chat: Pick<WebClient['chat'], 'getPermalink'>;
}

export interface ReadSlackConversationParams {
    client: SlackReadClient;
    target: string;
    limit: number;
}

/**
 * The outcome of reading a conversation. `read` only supports channels and permalinks — a target
 * that resolves to a person names a DM, which needs `conversations.open` to find its channel id;
 * that belongs to `send`, not here, so it comes back as `unsupported_target` rather than guessed at.
 */
export type ReadSlackConversationResult =
    | Exclude<ResolveSlackTargetResult, { outcome: 'resolved' }>
    | { outcome: 'unsupported_target'; kind: ResolvedSlackTarget['kind'] }
    | { outcome: 'read'; channelId: string; messages: SlackMessageRecord[]; omission: SlackMessagesOmission };

/**
 * Reads a channel's recent history, or — for a permalink into a thread — the whole thread. A
 * permalink's `?thread_ts=` (present only on a reply) decides which message anchors the thread:
 * its own ts if it names the message that opened the thread, or the parent's ts if it names a
 * reply. Every returned message carries the permalink `chat.getPermalink` gave back for it, never
 * one built by hand.
 *
 * Both sources come back in the same order — chronological, oldest first — and both, when capped by
 * `limit`, keep the NEWEST messages. The two Slack APIs disagree on both points natively
 * (`conversations.history` is newest-first, `conversations.replies` pages from a thread's opening
 * message forward), so each reader normalises before handing over; see `toConversationPage`.
 */
export async function readSlackConversation(params: ReadSlackConversationParams): Promise<ReadSlackConversationResult> {
    const { client, target, limit } = params;

    const resolution = await resolveSlackTarget(client, target);
    if (resolution.outcome !== 'resolved') {
        return resolution;
    }
    if (resolution.target.kind !== 'channel') {
        return { outcome: 'unsupported_target', kind: resolution.target.kind };
    }

    const channelId = resolution.target.id;
    const threadAnchor = extractThreadAnchor(target);

    const page = threadAnchor
        ? await readThread({ client, channelId, threadTs: threadAnchor, limit })
        : await readHistory({ client, channelId, limit });

    return { outcome: 'read', channelId, messages: page.messages, omission: page.omission };
}

/**
 * Extracts the ts to anchor `conversations.replies` on, from a permalink target.
 * `resolveSlackTarget`'s permalink branch only surfaces the channel id — the message-level shape is
 * deferred here, to `parseSlackPermalink`.
 */
function extractThreadAnchor(target: string): string | undefined {
    const parsed = parseSlackTarget(target);
    if (parsed.kind !== 'permalink') {
        return undefined;
    }

    const link = parseSlackPermalink(parsed.url);
    assert(link, 'parseSlackTarget classified a permalink that parseSlackPermalink could not parse');
    return link.threadTs ?? link.ts;
}

interface ConversationPage {
    messages: SlackMessageRecord[];
    omission: SlackMessagesOmission;
}

interface ReadThreadParams {
    client: SlackReadClient;
    channelId: string;
    threadTs: string;
    limit: number;
}

/**
 * Reads the end of a thread. `conversations.replies` pages from the thread's opening message
 * forward, so the newest replies — where the conversation actually landed, and the reason a thread
 * gets read at all — sit on its LAST page. Taking the first page would hand back the opening of a
 * long thread and call it the conversation, so the cursor is walked to the end while a rolling
 * window keeps the newest `limit + 1` messages: one more than gets shown, which is what proves
 * something older was dropped without a further call.
 */
async function readThread(params: ReadThreadParams): Promise<ConversationPage> {
    const { client, channelId, threadTs, limit } = params;

    const window: SlackConversationMessage[] = [];
    let cursor: string | undefined;
    let isFirstPage = true;

    do {
        const response = await client.conversations.replies({
            channel: channelId,
            ts: threadTs,
            cursor,
            limit: limit + 1,
        });
        const messages = response.messages ?? [];
        // Slack repeats the thread's parent at the head of every page; kept from the first page only,
        // so a paginated thread doesn't print its opening message once per page.
        window.push(...(isFirstPage ? messages : messages.filter(message => message.ts !== threadTs)));
        window.splice(0, Math.max(0, window.length - (limit + 1)));

        cursor = response.response_metadata?.next_cursor || undefined;
        isFirstPage = false;
    } while (cursor);

    // The cursor was walked to the end, so nothing is left beyond the window that the window's own
    // extra message doesn't already account for.
    return toConversationPage({ client, channelId, messages: window, hasOlder: false, limit });
}

interface ReadHistoryParams {
    client: SlackReadClient;
    channelId: string;
    limit: number;
}

/**
 * Reads the end of a channel. `conversations.history` returns newest-first, so its first page
 * already IS the most recent messages — requesting one more than `limit` is how the omission is
 * detected without a second call. Reversed into chronological order so a channel and a thread print
 * the same way round.
 */
async function readHistory(params: ReadHistoryParams): Promise<ConversationPage> {
    const { client, channelId, limit } = params;
    const response = await client.conversations.history({ channel: channelId, limit: limit + 1 });
    return toConversationPage({
        client,
        channelId,
        messages: (response.messages ?? []).toReversed(),
        hasOlder: response.has_more ?? false,
        limit,
    });
}

/** The shape of a single message shared by `conversations.history` and `conversations.replies`
 *  responses — enough to build a `SlackMessageRecord`, once its permalink is fetched separately.
 *  Exported so `watchSlackThread` can convert the one message it matches without duplicating this
 *  shape or the conversion below. */
export interface SlackConversationMessage {
    ts?: string;
    user?: string;
    username?: string;
    bot_profile?: { name?: string };
    text?: string;
    blocks?: SlackApiBlock[];
}

interface ToConversationPageParams {
    client: SlackReadClient;
    channelId: string;
    /** Chronological, oldest first — each reader normalises into this order before handing over. */
    messages: SlackConversationMessage[];
    /** Whether Slack reported further messages older than the oldest one handed in. */
    hasOlder: boolean;
    limit: number;
}

/**
 * Cuts a chronological run of messages down to the newest `limit` of them. Trimming from the start
 * rather than the end is the whole point: a read that must drop something drops the conversation's
 * opening, never where it landed — an agent asking what was decided reads the end of the thread.
 */
async function toConversationPage(params: ToConversationPageParams): Promise<ConversationPage> {
    const { client, channelId, messages, hasOlder, limit } = params;

    const truncated = messages.length > limit;
    const page = truncated ? messages.slice(messages.length - limit) : messages;

    return {
        messages: await Promise.all(page.map(message => toSlackMessageRecord(client, channelId, message))),
        omission: truncated || hasOlder ? { kind: 'atLeast', count: 1 } : { kind: 'none' },
    };
}

/** Fetches the one permalink a matched message needs and builds its `SlackMessageRecord` — the same
 *  conversion `readHistory`/`readThread` apply to a whole page, exported for `watchSlackThread` to
 *  reuse on the single message it finds. */
export async function toSlackMessageRecord(
    client: SlackReadClient,
    channelId: string,
    message: SlackConversationMessage,
): Promise<SlackMessageRecord> {
    assert(message.ts, 'conversation message missing a ts');

    const permalinkResponse = await client.chat.getPermalink({ channel: channelId, message_ts: message.ts });

    return {
        ts: message.ts,
        authorId: message.user,
        authorFallbackName: message.username ?? message.bot_profile?.name,
        body: extractSlackMessageBody(message),
        permalink: permalinkResponse.permalink,
    };
}
