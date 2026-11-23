import type { WebClient } from '@slack/web-api';

import { assert } from '@nzyme/utils/assert.js';
import type { SlackDirectoryClient } from '@nzyme/slack/utils/fetchSlackDirectory.js';
import { parseSlackPermalink } from '@nzyme/slack/utils/parseSlackPermalink.js';
import { resolveSlackTarget } from '@nzyme/slack/utils/resolveSlackTarget.js';
import type { ResolveSlackTargetResult } from '@nzyme/slack/utils/resolveSlackTarget.js';

import type { SlackTaskLink } from './SlackCommandsOptions.js';
import { tryBuildSlackMessage } from './tryBuildSlackMessage.js';

/** The subset of `WebClient` `send` needs — narrow enough that a test can pass a plain fake. Extends
 *  the directory client since resolving a target needs it too. */
export interface SlackSendClient extends SlackDirectoryClient {
    conversations: SlackDirectoryClient['conversations'] & Pick<WebClient['conversations'], 'open'>;
    chat: Pick<WebClient['chat'], 'postMessage' | 'getPermalink'>;
}

export interface PostSlackMessageParams {
    client: SlackSendClient;
    /** Raw CLI target argument. Absent when `thread` is given: a thread permalink already names
     *  its own channel, so a second, possibly contradicting destination is not accepted. */
    target: string | undefined;
    body: string;
    /** Slack user id of the developer the agent is writing on behalf of, from `auth.test`. */
    ownerId: string;
    /** A permalink into an existing thread, from `--thread`. Posting becomes a reply there instead
     *  of a new top-level message. */
    thread: string | undefined;
    taskLink: SlackTaskLink | undefined;
}

/**
 * A message that is already in Slack. Carries the ids `send` needs to arm a `--wait` on it without
 * re-parsing a permalink — and stays a success even when `permalink` is missing, because by the time
 * the permalink is looked up the message has already reached a human.
 */
export interface PostedSlackMessage {
    outcome: 'posted';
    channelId: string;
    /** ts of the posted message itself — the baseline a `--wait` on it starts from. */
    ts: string;
    /** ts anchoring the thread the message belongs to: the parent's when replying, its own otherwise. */
    threadTs: string;
    /** Absent when `chat.getPermalink` failed after the message was already delivered. */
    permalink: string | undefined;
}

export type PostSlackMessageResult =
    | Exclude<ResolveSlackTargetResult, { outcome: 'resolved' }>
    | { outcome: 'invalid_thread' }
    | { outcome: 'empty_body' }
    | { outcome: 'broadcast_mention' }
    | PostedSlackMessage;

/**
 * Posts one agent message. Resolves where it goes — a person's DM, opened here via
 * `conversations.open` since `resolveSlackTarget` deliberately does not; a channel directly; or an
 * existing thread from its permalink — builds the body+divider+footer payload via
 * `buildSlackMessage`, and posts it. Every rejection (unresolved target, refused body) comes back as
 * a result variant instead of a thrown error, mirroring `resolveSlackTarget`/`readSlackConversation`
 * so `SlackSendCommand` handles every outcome through one switch. Once `chat.postMessage` resolves
 * the result is `posted` no matter what follows — see {@link resolvePermalink}.
 */
export async function postSlackMessage(params: PostSlackMessageParams): Promise<PostSlackMessageResult> {
    const { client, target, body, ownerId, thread, taskLink } = params;

    const destination = await resolveDestination({ client, target, thread });
    if (destination.outcome !== 'resolved') {
        return destination;
    }

    const message = tryBuildSlackMessage({ body, ownerId, isReply: destination.isReply, taskLink });
    if (message.outcome !== 'built') {
        return message;
    }

    const posted = await client.chat.postMessage({
        channel: destination.channelId,
        thread_ts: destination.threadTs,
        text: message.payload.text,
        blocks: message.payload.blocks,
        // An agent message is a question someone has to read and answer, so a preview card is bulk
        // in front of it every time — the footer's task link alone unfurled into half a screen.
        // Slack only offers this per message, never per link, and a labelled link does not suppress
        // it either, so the whole message opts out.
        // Verified 2026-09-21 against the live workspace: this also stops the
        // Linear app's own unfurl, which arrives through `link_shared` rather than Slack's crawler.
        unfurl_links: false,
        unfurl_media: false,
    });
    assert(posted.ts, 'chat.postMessage succeeded without a ts in its response');

    return {
        outcome: 'posted',
        channelId: destination.channelId,
        ts: posted.ts,
        threadTs: destination.threadTs ?? posted.ts,
        permalink: await resolvePermalink(client, destination.channelId, posted.ts),
    };
}

/**
 * Looks up the permalink of the message just posted, and gives up quietly when that second call
 * fails. `chat.getPermalink` is a separate request made after the message is already delivered, so
 * letting its failure fail the whole `send` would tell the caller to retry and ask a human the same
 * question twice (`CLAUDE.md` → Gotchas: external integrations must be idempotent). The caller
 * reports the delivered message without its link instead.
 */
async function resolvePermalink(
    client: SlackSendClient,
    channelId: string,
    messageTs: string,
): Promise<string | undefined> {
    try {
        const response = await client.chat.getPermalink({ channel: channelId, message_ts: messageTs });
        return response.permalink;
    } catch {
        return undefined;
    }
}

interface ResolveDestinationParams {
    client: SlackSendClient;
    target: string | undefined;
    thread: string | undefined;
}

type DestinationResult =
    | Exclude<ResolveSlackTargetResult, { outcome: 'resolved' }>
    | { outcome: 'invalid_thread' }
    | { outcome: 'resolved'; channelId: string; threadTs: string | undefined; isReply: boolean };

/** `--thread` fully determines routing from the permalink alone; otherwise the target resolves the
 *  usual way, and a person needs a DM opened before anything can be posted to them. */
async function resolveDestination(params: ResolveDestinationParams): Promise<DestinationResult> {
    const { client, target, thread } = params;

    if (thread != null) {
        const parsed = parseSlackPermalink(thread);
        if (!parsed) {
            return { outcome: 'invalid_thread' };
        }
        return {
            outcome: 'resolved',
            channelId: parsed.channelId,
            threadTs: parsed.threadTs ?? parsed.ts,
            isReply: true,
        };
    }

    assert(target, 'postSlackMessage needs a target when no thread permalink is given');
    const resolution = await resolveSlackTarget(client, target);
    if (resolution.outcome !== 'resolved') {
        return resolution;
    }

    if (resolution.target.kind === 'person') {
        const opened = await client.conversations.open({ users: resolution.target.id });
        assert(opened.channel?.id, 'conversations.open succeeded without a channel id in its response');
        return { outcome: 'resolved', channelId: opened.channel.id, threadTs: undefined, isReply: false };
    }

    return { outcome: 'resolved', channelId: resolution.target.id, threadTs: undefined, isReply: false };
}
