import type { KnownBlock } from '@slack/web-api';

import { blocksToMarkdown } from './blocksToMarkdown.js';
import { filterNotNull } from '@nzyme/utils/array/filterNotNull.js';

/**
 * The subset of a Slack API block's fields `blocksToMarkdown` actually reads (divider, header,
 * section, image-by-URL) — shaped identically across the differently-named per-endpoint block
 * types `@slack/web-api` auto-generates for its responses (`search.messages`'s `MatchBlock`,
 * `conversations.history`/`conversations.replies`'s `AssistantAppThreadBlock`). Those structurally
 * diverge from `@nzyme/slack`'s hand-authored `KnownBlock` union — required vs optional `type`, an
 * enum vs a string-literal discriminant — even though both describe the same wire format, so this
 * shape lets one converter serve every read/search call site without duplicating it per response
 * type.
 */
export interface SlackApiBlock {
    type?: string;
    text?: { text?: string };
    fields?: { text?: string }[];
    alt_text?: string;
    image_url?: string;
}

/** The subset of a Slack API message needed to render its body — shared by search matches and
 *  conversation history/reply messages. */
export interface SlackApiMessageBody {
    text?: string;
    blocks?: SlackApiBlock[];
}

/**
 * Renders a Slack message's body as markdown, preferring its blocks over its raw `text` — a
 * block-built message (an app's card, a bot's structured alert) can leave `text` empty or a
 * placeholder summary, so reading `text` alone silently drops the real content. The actual
 * block-to-markdown rendering is `@nzyme/slack`'s `blocksToMarkdown`; only the block shape is
 * adapted here.
 * @__NO_SIDE_EFFECTS__
 */
export function extractSlackMessageBody(message: SlackApiMessageBody): string {
    const known = filterNotNull((message.blocks ?? []).map(toKnownBlock));
    if (known.some(carriesBodyText)) {
        const markdown = blocksToMarkdown(known);
        if (markdown) {
            return markdown;
        }
    }
    return message.text ?? '';
}

/**
 * Whether a block contributes body text rather than layout. A `divider` renders as `---`, which is
 * enough to make the conversion non-empty and so suppress the `text` fallback — and that is exactly
 * the shape our own `send` messages come back in, since Slack expands their `markdown` body block
 * into `rich_text` that `blocksToMarkdown` does not read, leaving the divider as the only block it
 * does. Without this the agent could not read back the very question it asked.
 */
function carriesBodyText(block: KnownBlock): boolean {
    return block.type !== 'divider';
}

function toKnownBlock(block: SlackApiBlock): KnownBlock | undefined {
    switch (block.type) {
        case 'divider':
            return { type: 'divider' };
        case 'header':
            return block.text?.text
                ? { type: 'header', text: { type: 'plain_text', text: block.text.text } }
                : undefined;
        case 'section':
            return toSectionBlock(block);
        case 'image':
            return block.image_url
                ? { type: 'image', image_url: block.image_url, alt_text: block.alt_text ?? '' }
                : undefined;
        default:
            // Interactive/layout blocks (actions, context, input…) carry no readable body text.
            return undefined;
    }
}

function toSectionBlock(block: SlackApiBlock): KnownBlock | undefined {
    const text = block.text?.text ? { type: 'mrkdwn' as const, text: block.text.text } : undefined;
    const fields = filterNotNull(
        (block.fields ?? []).map(field => (field.text ? { type: 'mrkdwn' as const, text: field.text } : undefined)),
    );

    if (!text && fields.length === 0) {
        return undefined;
    }
    return { type: 'section', text, fields: fields.length > 0 ? fields : undefined };
}
