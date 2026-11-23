import { describe, expect, test } from 'bun:test';

import { buildSlackFooter } from './buildSlackFooter.js';

const OWNER_ID = 'U0APV67CQKT';

describe('buildSlackFooter', () => {
    test('an opening message carries the marker, the reply instruction and the task link', () => {
        const block = buildSlackFooter({
            ownerId: OWNER_ID,
            isReply: false,
            taskLink: { id: 'SIG-519', url: 'https://linear.app/healed/issue/SIG-519' },
        });

        expect(block).toEqual({
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
        });
    });

    test('an opening message with no task omits the task segment, not a blank one', () => {
        const block = buildSlackFooter({ ownerId: OWNER_ID, isReply: false, taskLink: undefined });

        expect(block.elements).toEqual([
            {
                type: 'mrkdwn',
                text:
                    '🤖 AI agent writing on behalf of <@U0APV67CQKT> · ' +
                    'Reply in this thread, that is the only place the agent reads.',
            },
        ]);
    });

    // The shape the task spec calls out by name: a thread reply repeats only the marker, because the
    // opening message already said where to reply and named the task.
    test('a thread reply carries the marker only, even when a task exists', () => {
        const block = buildSlackFooter({
            ownerId: OWNER_ID,
            isReply: true,
            taskLink: { id: 'SIG-519', url: 'https://linear.app/healed/issue/SIG-519' },
        });

        expect(block.elements).toEqual([{ type: 'mrkdwn', text: '🤖 AI agent writing on behalf of <@U0APV67CQKT>' }]);
    });
});
