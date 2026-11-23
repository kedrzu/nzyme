import type { WebClient } from '@slack/web-api';

import { parseSlackPermalink } from '@nzyme/slack/utils/parseSlackPermalink.js';

import type { SlackTaskLink } from './SlackCommandsOptions.js';
import { tryBuildSlackMessage } from './tryBuildSlackMessage.js';

/** The subset of `WebClient` `edit` needs — narrow enough that a test can pass a plain fake. No
 *  directory client here, unlike `send`: a permalink already names its channel, so nothing has to be
 *  resolved, and no `chat.getPermalink` either — see {@link EditedSlackMessage}. */
export interface SlackEditClient {
    conversations: Pick<WebClient['conversations'], 'replies'>;
    chat: Pick<WebClient['chat'], 'update'>;
}

export interface EditSlackMessageParams {
    client: SlackEditClient;
    /** Permalink of the message to rewrite — the only way a message is named for editing. */
    permalink: string;
    /** The whole new body: an edit replaces what the message said, it never patches part of it. */
    body: string;
    /** Slack user id of the developer the agent is writing on behalf of, from `auth.test`. Doubles
     *  as the authorship half of the recognition in {@link editSlackMessage}. */
    ownerId: string;
    /** The branch's Linear task, when one exists — resolved by the caller exactly as for `send`, so
     *  the footer link comes from the branch doing the EDIT. Accepted rather than resolved here so
     *  this stays free of git, like `postSlackMessage`. */
    taskLink: SlackTaskLink | undefined;
}

/** A message that has been rewritten. Carries no permalink: `chat.update` changes neither channel
 *  nor ts, so the permalink the caller passed in still names the message and looking one up would be
 *  a second request for something already known. */
export interface EditedSlackMessage {
    outcome: 'edited';
    channelId: string;
    ts: string;
}

export type EditSlackMessageResult =
    | { outcome: 'invalid_permalink' }
    | { outcome: 'message_not_found' }
    | { outcome: 'not_agent_message' }
    | { outcome: 'empty_body' }
    | { outcome: 'broadcast_mention' }
    | EditedSlackMessage;

/**
 * Rewrites one message the agent itself posted. Every refusal comes back as a result variant rather
 * than a thrown error, mirroring `postSlackMessage` so the command handles all of them through one
 * switch.
 *
 * A message counts as the agent's own on two metadata conditions and no text matching at all: it was
 * written by the token owner (`user`), and it went out through the API rather than from a Slack
 * client (`app_id` is present — a hand-typed message has none). Both are set by Slack, so the
 * footer's wording may change without making older messages unrecognisable, and matching on the
 * marker text would be brittle anyway — Slack stores the emoji as `:robot_face:`. Either condition failing means `chat.update` is
 * never called: the token is the developer's personal one, so without the check the agent could
 * rewrite sentences he typed himself.
 *
 * The footer is rebuilt from scratch through the same `buildSlackMessage` the posting path uses,
 * never carried over from the message being replaced — a footer read back out of old blocks would
 * have to be parsed, and parsing our own rendering is exactly the brittleness the recognition above
 * avoids.
 */
export async function editSlackMessage(params: EditSlackMessageParams): Promise<EditSlackMessageResult> {
    const { client, permalink, body, ownerId, taskLink } = params;

    const link = parseSlackPermalink(permalink);
    if (!link) {
        return { outcome: 'invalid_permalink' };
    }

    // Anchored on the message itself, `conversations.replies` returns it whether it is top-level or a
    // reply inside a thread — `conversations.history` cannot see a thread reply at all. Verified live
    // 2026-09-22: anchored on a reply's own ts this comes back as that one message, while anchored on
    // a thread parent it comes back as the parent AND its replies even at `limit: 1`. So the message
    // is picked by its exact ts rather than by taking whatever came first.
    const response = await client.conversations.replies({ channel: link.channelId, ts: link.ts, limit: 1 });
    const message = response.messages?.find(candidate => candidate.ts === link.ts);
    if (!message) {
        return { outcome: 'message_not_found' };
    }

    if (message.user !== ownerId || !message.app_id) {
        return { outcome: 'not_agent_message' };
    }

    // Slack gives a thread's opening message a `thread_ts` equal to its own ts once it has replies,
    // so only a `thread_ts` naming a DIFFERENT message marks a reply — and only a reply gets the
    // short footer, since the message that opened the thread already said where to reply.
    const isReply = message.thread_ts != null && message.thread_ts !== message.ts;

    const rebuilt = tryBuildSlackMessage({ body, ownerId, isReply, taskLink });
    if (rebuilt.outcome !== 'built') {
        return rebuilt;
    }

    // No `unfurl_links`/`unfurl_media`: `chat.update` does not accept them, so an edit cannot repeat
    // the link-preview opt-out `send` applies.
    await client.chat.update({
        channel: link.channelId,
        ts: link.ts,
        text: rebuilt.payload.text,
        blocks: rebuilt.payload.blocks,
    });

    return { outcome: 'edited', channelId: link.channelId, ts: link.ts };
}
