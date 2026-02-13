import type { SectionBlock } from '@slack/web-api';

import { mapNotNull } from '@nzyme/utils/array/mapNotNull.js';

import type { SlackText } from '../types.js';
import { joinLines } from '../utils/joinLines.js';

/**
 * Configuration options for creating a Slack section block
 */
export type SlackSection = {
    /**
     *
     */
    fields?: (string | false | null | undefined)[];
    /**
     *
     */
    text?: SlackText;
};

/**
 * Creates a section block for Slack messages
 *
 * @param options Configuration options for the section
 * @returns Slack section block
 */
export function slackSection(options: SlackSection): SectionBlock {
    return {
        type: 'section',
        text: options.text
            ? {
                  type: 'mrkdwn',
                  text: joinLines(options.text),
              }
            : undefined,
        fields: options.fields
            ? mapNotNull(options.fields, field => {
                  if (!field) {
                      return;
                  }

                  return {
                      type: 'mrkdwn',
                      text: field,
                  };
              })
            : undefined,
    };
}
