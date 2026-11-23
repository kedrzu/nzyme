import { describe, expect, test } from 'bun:test';

import { parseSlackPermalink } from './parseSlackPermalink.js';

describe('parseSlackPermalink', () => {
    test('parses the permalink of a message that opened a thread, with no threadTs', () => {
        const result = parseSlackPermalink('https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000000');
        expect(result).toEqual({ channelId: 'C0123ABCDE', ts: '1700000000.000000', threadTs: undefined });
    });

    // The whole reason this file exists: `?thread_ts=` is what tells `read` a permalink names a
    // reply, not the message that opened the thread — losing this distinction means the thread
    // root ts never gets picked as the anchor for `conversations.replies`.
    test('parses a reply permalink, extracting the thread root ts from thread_ts', () => {
        const result = parseSlackPermalink(
            'https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000100?thread_ts=1699999999.000000&cid=C0123ABCDE',
        );
        expect(result).toEqual({
            channelId: 'C0123ABCDE',
            ts: '1700000000.000100',
            threadTs: '1699999999.000000',
        });
    });

    test('returns undefined for a URL that is not a Slack message permalink', () => {
        expect(parseSlackPermalink('https://example.com/archives/C0123ABCDE/p1700000000000000')).toBeUndefined();
    });

    test('returns undefined for a channel-only Slack URL with no message component', () => {
        expect(parseSlackPermalink('https://sigma-health.slack.com/archives/C0123ABCDE')).toBeUndefined();
    });

    test('trims surrounding whitespace before parsing', () => {
        const result = parseSlackPermalink('  https://sigma-health.slack.com/archives/C0123ABCDE/p1700000000000000  ');
        expect(result).toEqual({ channelId: 'C0123ABCDE', ts: '1700000000.000000', threadTs: undefined });
    });
});
