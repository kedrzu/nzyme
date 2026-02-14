import { phoneLink } from '@nzyme/utils/phoneLink.js';

import { slackLink } from './slackLink.js';

/**
 * Creates a clickable phone number link for Slack messages
 *
 * @param phone Phone number to create a link for
 * @returns Formatted Slack phone link
 */
export function slackPhone(phone: string): string {
    return slackLink(phoneLink(phone), phone);
}
