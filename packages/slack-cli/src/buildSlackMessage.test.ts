import { describe, expect, test } from 'bun:test';

import { BroadcastMentionError } from '@nzyme/slack/utils/assertNoBroadcastMention.js';

import { buildSlackMessage, EmptySlackMessageError } from './buildSlackMessage.js';

const OWNER_ID = 'U0APV67CQKT';

describe('buildSlackMessage', () => {
    test('renders body, divider, footer — and the marker leads the fallback text', () => {
        const message = buildSlackMessage({
            body: 'Does the audit retention control cover the management account too?',
            ownerId: OWNER_ID,
            isReply: false,
            taskLink: { id: 'SIG-519', url: 'https://linear.app/healed/issue/SIG-519' },
        });

        expect(message.blocks).toEqual([
            {
                type: 'markdown',
                text: 'Does the audit retention control cover the management account too?',
            },
            { type: 'divider' },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text:
                            '🤖 AI agent writing on behalf of <@U0APV67CQKT> · ' +
                            'Reply in this thread, that is the only place the agent reads. · ' +
                            '<https://linear.app/healed/issue/SIG-519|SIG-519>',
                    },
                ],
            },
        ]);
        expect(message.text).toBe(
            '🤖 AI agent writing on behalf of <@U0APV67CQKT>\n' +
                'Does the audit retention control cover the management account too?',
        );
    });

    // Must protect: the body reaches Slack as standard Markdown, not as its mrkdwn dialect — a
    // section block would render `**bold**` as literal asterisks.
    test('carries the body as standard Markdown, verbatim', () => {
        const message = buildSlackMessage({
            body: "You're invited as the second **Owner**, per [the runbook](https://example.com/runbook).",
            ownerId: OWNER_ID,
            isReply: false,
            taskLink: undefined,
        });

        expect(message.blocks[0]).toEqual({
            type: 'markdown',
            text: "You're invited as the second **Owner**, per [the runbook](https://example.com/runbook).",
        });
    });

    test('normalizes a line-final bare URL in the block, but not in the fallback text', () => {
        const message = buildSlackMessage({
            body: 'Sign up at https://vault.bitwarden.com\nThe data region is picked at creation.',
            ownerId: OWNER_ID,
            isReply: false,
            taskLink: undefined,
        });

        expect(message.blocks[0]).toEqual({
            type: 'markdown',
            text: 'Sign up at <https://vault.bitwarden.com>\nThe data region is picked at creation.',
        });
        expect(message.text).toBe(
            '🤖 AI agent writing on behalf of <@U0APV67CQKT>\n' +
                'Sign up at https://vault.bitwarden.com\nThe data region is picked at creation.',
        );
    });

    test('a thread reply gets the short footer, matching buildSlackFooter', () => {
        const message = buildSlackMessage({
            body: 'Both, if the control is account-scoped.',
            ownerId: OWNER_ID,
            isReply: true,
            taskLink: { id: 'SIG-519', url: 'https://linear.app/healed/issue/SIG-519' },
        });

        expect(message.blocks[2]).toEqual({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: '🤖 AI agent writing on behalf of <@U0APV67CQKT>' }],
        });
    });

    // Must protect: an empty body never reaches Slack as a bare footer.
    test('refuses an empty body', () => {
        expect(() => buildSlackMessage({ body: '', ownerId: OWNER_ID, isReply: false, taskLink: undefined })).toThrow(
            EmptySlackMessageError,
        );
    });

    test('refuses a whitespace-only body', () => {
        expect(() =>
            buildSlackMessage({ body: '   \n\t  ', ownerId: OWNER_ID, isReply: false, taskLink: undefined }),
        ).toThrow(EmptySlackMessageError);
    });

    // Must protect: a broadcast mention in the body is refused, not merely stripped or escaped.
    test('refuses a body containing a broadcast mention', () => {
        expect(() =>
            buildSlackMessage({ body: 'hello @channel', ownerId: OWNER_ID, isReply: false, taskLink: undefined }),
        ).toThrow(BroadcastMentionError);
    });

    test('does not set link_names — a mention only ever comes from slackMention', () => {
        const message = buildSlackMessage({ body: 'hi', ownerId: OWNER_ID, isReply: false, taskLink: undefined });

        expect(message).not.toHaveProperty('link_names');
    });
});
