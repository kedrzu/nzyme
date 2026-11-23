import type { KnownBlock } from '@slack/web-api';

import { slackDivider } from '@nzyme/slack/components/slackDivider.js';
import { slackMarkdown } from '@nzyme/slack/components/slackMarkdown.js';
import { slackMention } from '@nzyme/slack/components/slackMention.js';
import { assertNoBroadcastMention } from '@nzyme/slack/utils/assertNoBroadcastMention.js';

import { buildSlackFooter, SLACK_AGENT_MARKER } from './buildSlackFooter.js';
import type { SlackTaskLink } from './SlackCommandsOptions.js';

/** Raised for a body that is empty, or whitespace-only, once trimmed — refused rather than posting
 *  a message that is nothing but the footer. */
export class EmptySlackMessageError extends Error {
    constructor() {
        super('Refused to send an empty message body');
        this.name = 'EmptySlackMessageError';
    }
}

export interface BuildSlackMessageParams {
    /** Raw message body from the caller (untrimmed, unvalidated stdin content). */
    body: string;
    /** Slack user id of the developer the agent is writing on behalf of. */
    ownerId: string;
    /** True when posting into a thread that already carries the opening message's full footer. */
    isReply: boolean;
    /** The branch's Linear task, when one exists. Ignored for a reply — see {@link buildSlackFooter}. */
    taskLink: SlackTaskLink | undefined;
}

/** What `chat.postMessage` needs beyond channel/thread routing: the rendered blocks, and the
 *  fallback `text` mobile push notifications read instead of the blocks. */
export interface SlackMessagePayload {
    text: string;
    blocks: KnownBlock[];
}

/**
 * Builds the body-then-divider-then-footer shape every `send` message posts. The single choke point
 * that enforces both writing invariants — no broadcast mention, no empty body — so nothing can reach
 * `chat.postMessage` without having gone through this. `assertNoBroadcastMention` guards the block
 * body; the top-level `text` field repeats the marker so a mobile push notification, which never
 * renders `blocks`, still says an agent wrote it.
 *
 * The body goes into a `markdown` block, so what the agent writes is plain Markdown and Slack does
 * the translating: a section block's `mrkdwn` would render `**bold**` as literal asterisks. The
 * footer stays a `context` block, which has no Markdown form, so it is built from `mrkdwn`.
 */
export function buildSlackMessage(params: BuildSlackMessageParams): SlackMessagePayload {
    const { ownerId, isReply, taskLink } = params;

    const body = params.body.trim();
    if (!body) {
        throw new EmptySlackMessageError();
    }
    assertNoBroadcastMention(body);

    return {
        // The fallback text keeps the body exactly as written: it is never rendered, only read out
        // by a mobile push notification, where the autolink brackets `slackMarkdown` adds around a
        // line-final URL would be visible noise.
        text: `${SLACK_AGENT_MARKER} ${slackMention(ownerId)}\n${body}`,
        blocks: [slackMarkdown(body), slackDivider(), buildSlackFooter({ ownerId, isReply, taskLink })],
    };
}
