/**
 * Creates a clickable link for Slack messages using Slack's link format
 *
 * @param url URL to link to
 * @param text Display text for the link
 * @returns Formatted Slack link string
 */
export function slackLink(url: string, text: bigint | number | string): string {
    return `<${url}|${text}>`;
}
