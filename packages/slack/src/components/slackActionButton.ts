import type { Button } from '@slack/web-api';

/**
 * Configuration options for creating a Slack action button
 */
export type SlackActionButton = {
    /**
     * The action ID for the button
     */
    action: string;
    /**
     * The style of the button
     */
    style?: Button['style'];
    /**
     * The text of the button
     */
    text: string;
    /**
     * The value of the button
     */
    value: unknown;
};

/**
 * Creates an action button for Slack interactive messages
 *
 * @param options Configuration options for the button
 * @returns Slack button element
 */
export function slackActionButton(options: SlackActionButton): Button {
    return {
        type: 'button',
        action_id: options.action,
        value: serializeValue(options.value),
        style: options.style,
        text: {
            type: 'plain_text',
            text: options.text,
        },
    };
}

/**
 * Serializes button value to string format
 *
 * @param value Value to serialize
 * @returns Serialized string value
 */
function serializeValue(value: unknown) {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
}
