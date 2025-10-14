import type { HeaderBlock } from '@slack/web-api';

/**
 * Creates a header block for Slack messages
 *
 * @param text Text to display in the header
 * @returns Slack header block
 */
export function slackHeader(text: string): HeaderBlock {
    return {
        type: 'header',
        text: {
            type: 'plain_text',
            text: text,
        },
    };
}
