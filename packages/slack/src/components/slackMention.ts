/**
 * Creates a formatted mention of one or more Slack members
 *
 * @param memberId ID of the member(s) to mention
 * @returns Formatted Slack mention string
 */
export function slackMention(memberId: string | string[]): string {
    if (Array.isArray(memberId)) {
        return memberId.map(id => formatMention(id)).join(', ');
    }

    return formatMention(memberId);
}

/**
 * Formats a single member ID as a Slack mention
 *
 * @param memberId ID of the member to mention
 * @returns Formatted Slack mention string
 */
function formatMention(memberId: string): string {
    return `<@${memberId}>`;
}
