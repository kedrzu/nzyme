import type { MarkdownBlock } from '@slack/web-api';

/**
 * Matches a bare URL that ends its line, allowing sentence punctuation after it. Anchored on a line
 * start or whitespace so a URL already inside `<…>` or a `[label](url)` link — preceded by `<` or
 * `(` — is left alone, and the punctuation is captured separately so it stays outside the brackets
 * rather than being swallowed into the link.
 */
const LINE_FINAL_URL = /(^|\s)(https?:\/\/[^\s<>]+?)([.,;:!?]*)$/;

/** Opens or closes a fenced code block, in either of Markdown's two fence characters. */
const CODE_FENCE = /^\s*(?:```|~~~)/;

/**
 * Creates a markdown block for Slack messages, carrying standard Markdown that Slack translates
 * itself. Unlike a section block — whose text is `mrkdwn`, Slack's own dialect where bold is
 * `*bold*` and a link is `<url|label>` — this block accepts `**bold**`, `[label](url)`, `-`/`1.`
 * lists and fenced code, and holds 12,000 characters rather than 3,000. Slack expands it into
 * `rich_text` on receipt, so one block may come back as several.
 *
 * Every bare URL that ends a line is wrapped in Markdown's autolink brackets. Slack's Markdown
 * parser reads a line-final bare URL greedily across the newline, so
 * `Sign up at https://vault.bitwarden.com\nThe data region…` posts a link whose href is
 * `https://vault.bitwarden.com\nThe` and eats the following word. Verified against a live
 * workspace on 2026-09-21; the same URL mid-sentence, before a blank line, or inside a list item is
 * parsed correctly, and `<https://vault.bitwarden.com>` fixes the broken case. It is done here
 * rather than left to whoever writes the text, because every caller would otherwise have to
 * remember it. Lines inside a fenced code block are skipped — a URL there is content, not a link.
 *
 * @param text Standard Markdown content
 * @returns Slack markdown block
 * @__NO_SIDE_EFFECTS__
 */
export function slackMarkdown(text: string): MarkdownBlock {
    let insideFence = false;

    const wrapped = text
        .split('\n')
        .map(line => {
            if (CODE_FENCE.test(line)) {
                insideFence = !insideFence;
                return line;
            }

            if (insideFence) {
                return line;
            }

            return line.replace(LINE_FINAL_URL, (_match, lead: string, url: string, punctuation: string) => {
                return `${lead}<${url}>${punctuation}`;
            });
        })
        .join('\n');

    return {
        type: 'markdown',
        text: wrapped,
    };
}
