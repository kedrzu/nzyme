import { describe, expect, test } from 'bun:test';

import { extractSlackMessageBody } from './extractSlackMessageBody.js';

describe('extractSlackMessageBody', () => {
    // Must protect: the agent can read back its own message. Slack expands the `markdown` body
    // block `send` posts into `rich_text`, which `blocksToMarkdown` does not read — so the divider
    // beneath it is the only block that converts, and counting its `---` as content would leave the
    // whole question unreadable in the thread the agent is waiting on.
    test('falls back to text when the blocks are the shape send posts', () => {
        const body = extractSlackMessageBody({
            text: '🤖 AI agent writing on behalf of <@U0APV67CQKT>\nDoes the retention control cover it?',
            blocks: [{ type: 'rich_text' }, { type: 'divider' }, { type: 'context' }],
        });

        expect(body).toBe('🤖 AI agent writing on behalf of <@U0APV67CQKT>\nDoes the retention control cover it?');
    });

    test('renders a block-built message from its blocks, dividers included', () => {
        const body = extractSlackMessageBody({
            text: 'placeholder summary',
            blocks: [
                { type: 'section', text: { text: 'Deploy succeeded.' } },
                { type: 'divider' },
                { type: 'section', text: { text: 'Version 1.2.3' } },
            ],
        });

        expect(body).toBe('Deploy succeeded.\n\n---\n\nVersion 1.2.3');
    });

    test('falls back to text when a message has no blocks at all', () => {
        expect(extractSlackMessageBody({ text: 'Just typed this.' })).toBe('Just typed this.');
    });

    test('returns an empty string when there is nothing to render', () => {
        expect(extractSlackMessageBody({})).toBe('');
    });
});
