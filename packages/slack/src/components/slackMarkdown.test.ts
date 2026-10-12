import { describe, expect, test } from 'bun:test';

import { slackMarkdown } from './slackMarkdown.js';

describe('slackMarkdown', () => {
    describe('line-final URLs', () => {
        // Must protect: the case Slack actually gets wrong — a line-final bare URL whose link would
        // otherwise swallow the newline and the first word of the next line.
        test('wraps a bare URL that ends a line', () => {
            expect(textOf('Sign up at https://vault.bitwarden.com\nThe data region is picked.')).toBe(
                'Sign up at <https://vault.bitwarden.com>\nThe data region is picked.',
            );
        });

        test('wraps a bare URL on the last line too', () => {
            expect(textOf('Sign up at https://vault.bitwarden.com')).toBe('Sign up at <https://vault.bitwarden.com>');
        });

        test('leaves sentence punctuation outside the brackets', () => {
            expect(textOf('Sign up at https://vault.bitwarden.com.\nThen come back.')).toBe(
                'Sign up at <https://vault.bitwarden.com>.\nThen come back.',
            );
        });

        test('leaves a URL mid-sentence alone — Slack parses that one correctly', () => {
            const body = 'Sign up at https://vault.bitwarden.com — not the EU one.';
            expect(textOf(body)).toBe(body);
        });

        test('does not double-wrap a URL already in autolink brackets', () => {
            const body = 'Sign up at <https://vault.bitwarden.com>\nThe data region is picked.';
            expect(textOf(body)).toBe(body);
        });

        test('leaves a Markdown link alone', () => {
            const body = 'Sign up at [the US vault](https://vault.bitwarden.com)\nThe data region is picked.';
            expect(textOf(body)).toBe(body);
        });

        // Must protect: a URL inside a fenced code block is content, not a link — rewriting it would
        // change pasted code.
        test('leaves URLs inside a fenced code block untouched', () => {
            const body = 'Run:\n```\ncurl https://example.com/api\n```\nThen check the output.';
            expect(textOf(body)).toBe(body);
        });

        test('resumes wrapping after a fence closes', () => {
            expect(textOf('```\ncurl https://example.com/api\n```\nDocs: https://example.com/docs\nDone.')).toBe(
                '```\ncurl https://example.com/api\n```\nDocs: <https://example.com/docs>\nDone.',
            );
        });

        test('keeps a URL containing dots and a path intact', () => {
            expect(textOf('See https://bitwarden.com/help/two-step-recovery-code/\nPrint it.')).toBe(
                'See <https://bitwarden.com/help/two-step-recovery-code/>\nPrint it.',
            );
        });
    });
});

function textOf(text: string) {
    return slackMarkdown(text).text;
}
