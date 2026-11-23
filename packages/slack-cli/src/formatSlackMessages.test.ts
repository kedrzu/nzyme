import { describe, expect, test } from 'bun:test';

import type { SlackPersonEntry } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackMessages } from './formatSlackMessages.js';
import type { SlackMessageRecord } from './formatSlackMessages.js';

function person(overrides: Partial<SlackPersonEntry> = {}): SlackPersonEntry {
    return {
        kind: 'person',
        id: 'U02FR4NK1',
        handle: 'frank',
        firstName: 'Frank',
        realName: 'Frank Miller',
        displayName: undefined,
        email: undefined,
        title: undefined,
        ...overrides,
    };
}

function record(overrides: Partial<SlackMessageRecord> = {}): SlackMessageRecord {
    return {
        ts: '1700000000.000000',
        authorId: 'U02FR4NK1',
        authorFallbackName: undefined,
        body: 'Hello there',
        permalink: 'https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000000',
        ...overrides,
    };
}

describe('formatSlackMessages', () => {
    test('renders a header with time and resolved author name, the body, then the permalink', () => {
        const [block] = formatSlackMessages([record()], { people: [person()], omission: { kind: 'none' } });
        expect(block).toBe(
            '[2023-11-14 22:13:20] Frank Miller\n' +
                'Hello there\n' +
                'https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000000',
        );
    });

    test('falls back to the API-provided name when the author is not in the directory', () => {
        const [block] = formatSlackMessages([record({ authorId: undefined, authorFallbackName: 'Deploy Bot' })], {
            people: [person()],
            omission: { kind: 'none' },
        });
        expect(block).toContain('] Deploy Bot\n');
    });

    test('falls back to the raw author id when neither the directory nor an API name has it', () => {
        const [block] = formatSlackMessages([record({ authorId: 'U0UNKNOWN1', authorFallbackName: undefined })], {
            people: [person()],
            omission: { kind: 'none' },
        });
        expect(block).toContain('] U0UNKNOWN1\n');
    });

    test('prints "(no permalink)" rather than fabricating one when Slack returned none', () => {
        const [block] = formatSlackMessages([record({ permalink: undefined })], {
            people: [person()],
            omission: { kind: 'none' },
        });
        expect(block?.endsWith('(no permalink)')).toBe(true);
    });

    // This is the behaviour the task's "Must protect" guarantee is about: a caller that hands in a
    // nonzero omission must always see it stated, never silently dropped.
    test('appends an exact omitted-count line when the omission is exact and nonzero', () => {
        const lines = formatSlackMessages([record()], { people: [person()], omission: { kind: 'exact', count: 3 } });
        expect(lines).toHaveLength(2);
        expect(lines[1]).toBe('… 3 more messages omitted.');
    });

    // A read keeps the NEWEST messages, so the line must place what it dropped at the older end —
    // a reader who thinks the tail is missing would take the start of an argument for its conclusion.
    test('appends an "at least" line placing the omission earlier in the conversation', () => {
        const lines = formatSlackMessages([record()], { people: [person()], omission: { kind: 'atLeast', count: 1 } });
        expect(lines[1]).toBe(
            '… at least 1 more message exists earlier in this conversation (raise --limit to see them).',
        );
    });

    test('appends no omitted line at all when nothing was left out', () => {
        const lines = formatSlackMessages([record()], { people: [person()], omission: { kind: 'none' } });
        expect(lines).toHaveLength(1);
    });
});
