import { compareSlackTimestamps } from '@nzyme/slack/utils/compareSlackTimestamps.js';

import { SLACK_AGENT_MARKER } from './buildSlackFooter.js';

/** The minimal shape `selectOwnMessageBaseline` needs from a Slack message — its timestamp, and the
 *  raw `text` field checked for the agent marker. */
export interface SlackTimestampedMessage {
    ts: string;
    text: string | undefined;
}

/**
 * Selects every message posted strictly after `baselineTs` — what `wait` treats as a reply.
 * Deliberately ignores who posted it (needs only a `ts`): the agent and the developer post with the
 * same Slack account — the developer's own user token — so "posted by someone else"
 * cannot distinguish a reply from the agent's own message, and a reply is anything new in the
 * thread — including one the developer typed himself to steer the conversation. Compares with
 * `compareSlackTimestamps`, never as strings.
 * @__NO_SIDE_EFFECTS__
 */
export function selectMessagesAfter<T extends { ts: string }>(messages: T[], baselineTs: string): T[] {
    return messages.filter(message => compareSlackTimestamps(message.ts, baselineTs) > 0);
}

/**
 * Picks the baseline for a re-armed standalone `wait` that was not given `--after`: the last message
 * in the thread that our own tool posted, never the thread's opening message. This is what makes a
 * re-arm correct — if the agent had posted a follow-up after asking, baselining on the opening
 * message would make that follow-up look like the reply.
 *
 * "Posted by our own tool" is judged by the agent marker every `buildSlackMessage` stamps into the
 * top-level `text` field, NOT by the Slack author id — the agent and the developer share one Slack
 * account (`DECISIONS.md#d10`), so a reply the developer types directly in Slack's own UI carries the
 * exact same author id as a message this tool posted, and would wrongly look like our own follow-up
 * if author id were the test. The marker is the only thing that actually says "the tool wrote this".
 * Falls back to `threadRootTs` only when the tool never posted into this thread at all.
 * @__NO_SIDE_EFFECTS__
 */
export function selectOwnMessageBaseline<T extends SlackTimestampedMessage>(
    messages: T[],
    threadRootTs: string,
): string {
    let latest: string | undefined;
    for (const message of messages) {
        if (!isAgentPostedMessage(message.text)) {
            continue;
        }
        if (!latest || compareSlackTimestamps(message.ts, latest) > 0) {
            latest = message.ts;
        }
    }
    return latest ?? threadRootTs;
}

function isAgentPostedMessage(text: string | undefined): boolean {
    // The stable, emoji-independent tail of `SLACK_AGENT_MARKER` — everything after its leading
    // `🤖`. Verified live against `conversations.replies` (2026-09-21): Slack canonicalises that leading
    // emoji into its `:robot_face:` shortcode when it echoes a message's `text` field back through the
    // API, so matching the literal marker (emoji included) against a message READ BACK from Slack always
    // silently fails — it only ever matched the payload we sent, never what we get back. The plain-text
    // phrase after the emoji survives the round trip unchanged.
    const agentMarkerText = SLACK_AGENT_MARKER.replace(/^\S+\s*/, '');
    return text != null && text.includes(agentMarkerText);
}
