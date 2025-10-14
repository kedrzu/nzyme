import type { SectionBlock } from '@slack/web-api';

import type { SlackText } from '../types.js';
import { joinLines } from '../utils/joinLines.js';

/**
 * Configuration options for creating a fields section block in Slack
 */
export type SlackFieldsSection = {
    /**
     * Key-value pairs that will be rendered as fields in the section
     */
    fields: { [title: string]: unknown };
    /**
     * Optional text content to display above the fields
     */
    text?: SlackText;
};

/**
 * Creates a section block with fields for Slack messages
 *
 * @param options Configuration options for the fields section
 * @returns Slack section block with fields
 */
export function slackFieldsSection(options: SlackFieldsSection): SectionBlock {
    const fields: string[] = [];
    for (const key in options.fields) {
        fields.push(`*${key}:*\n${options.fields[key]?.toString() ?? ''}`);
    }

    return {
        type: 'section',
        text: options.text
            ? {
                  type: 'mrkdwn',
                  text: joinLines(options.text),
              }
            : undefined,
        fields: fields.map(field => ({
            type: 'mrkdwn',
            text: field,
        })),
    };
}
