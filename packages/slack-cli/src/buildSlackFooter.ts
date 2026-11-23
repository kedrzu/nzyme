import type { ContextBlock } from '@slack/web-api';

import { slackLink } from '@nzyme/slack/components/slackLink.js';
import { slackMention } from '@nzyme/slack/components/slackMention.js';

import type { SlackTaskLink } from './SlackCommandsOptions.js';

/**
 * The literal marker every outgoing message must carry — what tells a colleague reading the thread
 * that an agent, not the developer, wrote this line. Exported so `buildSlackMessage` can repeat it
 * at the start of the top-level `text` field, which mobile push notifications read instead of the
 * blocks, so a notification never passes an agent's words off as the developer's.
 */
export const SLACK_AGENT_MARKER = '🤖 AI agent writing on behalf of';

export interface BuildSlackFooterParams {
    /** Slack user id of the developer the agent is writing on behalf of — always the token owner's
     *  own id, from `auth.test`. */
    ownerId: string;
    /** True for a reply into a thread that already opened with the full footer — the short form
     *  repeats only the marker, since the opening message already said where to reply and named the
     *  task. */
    isReply: boolean;
    /** The branch's Linear task, when one exists. Rendered only on the opening message. */
    taskLink: SlackTaskLink | undefined;
}

/**
 * Builds the small grey `context` block every `send` message ends with: the marker and mention
 * always, and — on an opening message only — the reply instruction and the task link.
 * `@nzyme/slack` has no context-block component of its own, so this is the one block built by hand
 * rather than composed from the library.
 */
export function buildSlackFooter(params: BuildSlackFooterParams): ContextBlock {
    const { ownerId, isReply, taskLink } = params;

    const segments = [`${SLACK_AGENT_MARKER} ${slackMention(ownerId)}`];
    if (!isReply) {
        segments.push('Reply in this thread, that is the only place the agent reads.');
        if (taskLink) {
            segments.push(slackLink(taskLink.url, taskLink.id));
        }
    }

    return {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: segments.join(' · ') }],
    };
}
