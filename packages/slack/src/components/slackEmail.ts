import { getMailToUrl } from '@nzyme/utils/getMailToUrl.js';

import { slackLink } from './slackLink.js';

/**
 * Creates a clickable email link for Slack messages
 *
 * @param email Email address to create a link for
 * @returns Formatted Slack email link
 */
export function slackEmail(email: string): string {
    return slackLink(getMailToUrl(email), email);
}
