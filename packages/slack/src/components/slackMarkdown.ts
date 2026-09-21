import type { MarkdownBlock } from '@slack/web-api';

/**
 * Creates a markdown block for Slack messages, carrying standard Markdown that Slack translates
 * itself. Unlike a section block — whose text is `mrkdwn`, Slack's own dialect where bold is
 * `*bold*` and a link is `<url|label>` — this block accepts `**bold**`, `[label](url)`, `-`/`1.`
 * lists and fenced code, and holds 12,000 characters rather than 3,000. Slack expands it into
 * `rich_text` on receipt, so one block may come back as several.
 *
 * @param text Standard Markdown content
 * @returns Slack markdown block
 */
export function slackMarkdown(text: string): MarkdownBlock {
    return {
        type: 'markdown',
        text,
    };
}
