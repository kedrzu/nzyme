import { describe, expect, test } from 'bun:test';

import { assertNoBroadcastMention, BroadcastMentionError } from './assertNoBroadcastMention.js';

describe('assertNoBroadcastMention', () => {
    test('allows an ordinary message', () => {
        expect(() =>
            assertNoBroadcastMention('Does the audit retention control cover the management account too?'),
        ).not.toThrow();
    });

    test('refuses a raw @channel', () => {
        expect(() => assertNoBroadcastMention('hello @channel')).toThrow(BroadcastMentionError);
    });

    test('refuses a raw @here', () => {
        expect(() => assertNoBroadcastMention('hello @here')).toThrow(BroadcastMentionError);
    });

    test('refuses a raw @everyone', () => {
        expect(() => assertNoBroadcastMention('hello @everyone')).toThrow(BroadcastMentionError);
    });

    test('refuses a raw broadcast mention regardless of case', () => {
        expect(() => assertNoBroadcastMention('hello @CHANNEL')).toThrow(BroadcastMentionError);
    });

    test('refuses the Slack-encoded form', () => {
        expect(() => assertNoBroadcastMention('hello <!channel>')).toThrow(BroadcastMentionError);
        expect(() => assertNoBroadcastMention('hello <!here>')).toThrow(BroadcastMentionError);
        expect(() => assertNoBroadcastMention('hello <!everyone>')).toThrow(BroadcastMentionError);
    });

    test('refuses the Slack-encoded form carrying a display label', () => {
        expect(() => assertNoBroadcastMention('hello <!channel|@channel>')).toThrow(BroadcastMentionError);
    });

    test('does not false-positive on a different word sharing the same prefix', () => {
        expect(() => assertNoBroadcastMention('Ping @channels-list about this')).not.toThrow();
    });

    test('does not false-positive on an ordinary person mention', () => {
        expect(() => assertNoBroadcastMention('Ask <@U0APV67CQKT> about this')).not.toThrow();
    });
});
