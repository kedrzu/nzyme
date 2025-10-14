import type { Button } from '@slack/web-api';

/**
 * Configuration options for creating a Slack link button
 */
export type SlackLinkButton = {
    /**
     * The style of the button
     */
    style?: Button['style'];
    /**
     * The text of the button
     */
    text: string;
    /**
     * The URL to link to
     */
    url: string;
};

/**
 * Creates a link button for Slack messages that opens an external URL
 *
 * @param options Configuration options for the link button
 * @returns Slack button element
 */
export function slackLinkButton(options: SlackLinkButton): Button {
    return {
        type: 'button',
        url: options.url,
        style: options.style,
        text: {
            type: 'plain_text',
            text: options.text,
        },
    };
}
