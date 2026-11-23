import { describe, expect, test } from 'bun:test';

import { parseSlackTarget } from './parseSlackTarget.js';

describe('parseSlackTarget', () => {
    test('recognises a user id', () => {
        expect(parseSlackTarget('U0APV67CQKT')).toEqual({ kind: 'id', id: 'U0APV67CQKT' });
    });

    test('recognises a channel id', () => {
        expect(parseSlackTarget('C0123ABCDE')).toEqual({ kind: 'id', id: 'C0123ABCDE' });
    });

    test('recognises a message permalink and extracts the channel id', () => {
        const url = 'https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000000';
        expect(parseSlackTarget(url)).toEqual({ kind: 'permalink', channelId: 'C0123ABCDE', url });
    });

    test('recognises a permalink carrying a thread_ts query string', () => {
        const url =
            'https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000100?thread_ts=1700000000.000000&cid=C0123ABCDE';
        expect(parseSlackTarget(url)).toEqual({ kind: 'permalink', channelId: 'C0123ABCDE', url });
    });

    test('a URL that is not a Slack permalink falls back to free text', () => {
        expect(parseSlackTarget('https://example.com/archives/C0123ABCDE/p1700000000000000')).toEqual({
            kind: 'text',
            text: 'https://example.com/archives/C0123ABCDE/p1700000000000000',
        });
    });

    test('recognises a channel name', () => {
        expect(parseSlackTarget('#eng-platform')).toEqual({ kind: 'channelName', name: 'eng-platform' });
    });

    test('recognises a handle', () => {
        expect(parseSlackTarget('@frank')).toEqual({ kind: 'handle', handle: 'frank' });
    });

    test('recognises an email address', () => {
        expect(parseSlackTarget('frank@healed.care')).toEqual({ kind: 'email', email: 'frank@healed.care' });
    });

    test('falls back to free text for a plain name', () => {
        expect(parseSlackTarget('Frank')).toEqual({ kind: 'text', text: 'Frank' });
    });

    test('falls back to free text for a multi-word query', () => {
        expect(parseSlackTarget('all the developers')).toEqual({ kind: 'text', text: 'all the developers' });
    });

    // The real regression this guards: an all-caps English word (no digit) must never be misread as
    // a Slack id just because it starts with a letter from the id prefix set (here, "C").
    test('an all-caps word with no digit is not mistaken for an id', () => {
        expect(parseSlackTarget('CONTRACTORS')).toEqual({ kind: 'text', text: 'CONTRACTORS' });
    });

    test('a bare "#" is free text, not an empty channel name', () => {
        expect(parseSlackTarget('#')).toEqual({ kind: 'text', text: '#' });
    });

    test('a bare "@" is free text, not an empty handle', () => {
        expect(parseSlackTarget('@')).toEqual({ kind: 'text', text: '@' });
    });

    test('trims surrounding whitespace before classifying', () => {
        expect(parseSlackTarget('  @frank  ')).toEqual({ kind: 'handle', handle: 'frank' });
    });
});
