import type { Block, KnownBlock } from '@slack/web-api';

import { mapNotNull } from '@nzyme/utils/array/mapNotNull.js';

/**
 * Converts an array of Slack blocks to markdown format
 *
 * @param blocks Array of Slack blocks to convert
 * @returns Markdown string representation of the blocks
 */
export function blocksToMarkdown(blocks: (Block | KnownBlock)[]): string {
    return mapNotNull(blocks as KnownBlock[], blockToMarkdown).join('\n\n');
}

/**
 * Converts a single Slack block to markdown format
 *
 * @param block Slack block to convert
 * @returns Markdown string representation of the block or undefined if conversion not supported
 */
export function blockToMarkdown(block: KnownBlock): string | undefined {
    switch (block.type) {
        case 'divider':
            return '---';
        case 'header':
            return `# ${block.text?.text ?? ''}`;
        case 'section': {
            let text = block.text?.text ?? '';

            if (block.fields) {
                text += '\n' + block.fields.map(field => field.text).join('\n');
            }

            return text;
        }
        case 'image': {
            const title = block.title?.text ?? block.alt_text;

            if ('image_url' in block) {
                return `![${title}](${block.image_url})`;
            }

            if ('slack_file' in block && 'url' in block.slack_file) {
                return `![${title}](${block.slack_file.url})`;
            }
        }
    }
}
