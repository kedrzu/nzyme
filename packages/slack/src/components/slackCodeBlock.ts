import { joinLines } from '../utils/joinLines.js';
import { normalizeLines } from '../utils/normalizeLines.js';

/**
 * Creates a formatted code block for Slack messages
 *
 * @param text Code content as string or array of strings
 * @returns Formatted Slack code block
 */
export function slackCodeBlock(text: string | string[]): string {
    return joinLines(['```', ...normalizeLines(text), '```']);
}
