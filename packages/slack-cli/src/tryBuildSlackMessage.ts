import { BroadcastMentionError } from '@nzyme/slack/utils/assertNoBroadcastMention.js';

import type { BuildSlackMessageParams, SlackMessagePayload } from './buildSlackMessage.js';
import { buildSlackMessage, EmptySlackMessageError } from './buildSlackMessage.js';

export type TryBuildSlackMessageResult =
    | { outcome: 'built'; payload: SlackMessagePayload }
    | { outcome: 'empty_body' }
    | { outcome: 'broadcast_mention' };

/**
 * Turns `buildSlackMessage`'s thrown validation errors into result variants, so a refused body is
 * just another outcome alongside the ones its callers already return rather than a second
 * error-handling path. Shared by posting and editing because an edit must refuse exactly what a send
 * refuses — the rules are the message's, not the operation's.
 */
export function tryBuildSlackMessage(params: BuildSlackMessageParams): TryBuildSlackMessageResult {
    try {
        return { outcome: 'built', payload: buildSlackMessage(params) };
    } catch (error) {
        if (error instanceof EmptySlackMessageError) {
            return { outcome: 'empty_body' };
        }
        if (error instanceof BroadcastMentionError) {
            return { outcome: 'broadcast_mention' };
        }
        throw error;
    }
}
