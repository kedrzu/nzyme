import type { DividerBlock } from '@slack/web-api';

/**
 * Creates a divider block for Slack messages
 *
 * @returns Slack divider block
 */
export function slackDivider(): DividerBlock {
    return {
        type: 'divider',
    };
}
