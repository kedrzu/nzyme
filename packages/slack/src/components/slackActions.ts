import type { ActionsBlock } from '@slack/web-api';

/**
 * Configuration options for creating a Slack actions block
 */
export type SlackActions = Omit<ActionsBlock, 'type'>;

/**
 * Creates an actions block for Slack interactive messages
 *
 * @param options Configuration options for the actions block
 * @returns Slack actions block
 */
export function slackActions(options: SlackActions): ActionsBlock {
    return {
        type: 'actions',
        ...options,
    };
}
