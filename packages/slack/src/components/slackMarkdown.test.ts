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

        // Must protect: a URL closing an inline code span is code, not a link — wrapping it would
        // break the span apart.
        test('leaves a URL that ends an inline code span alone', () => {
            const body = 'Run `curl https://example.com`\nThen check the output.';
            expect(textOf(body)).toBe(body);
        });

        // Must protect: the closing paren of a parenthetical is not part of the URL — inside the
        // brackets it would send the link to the wrong address.
        test('leaves the closing paren of a parenthetical outside the brackets', () => {
            expect(textOf('Check the vault (see https://example.com).\nDone.')).toBe(
                'Check the vault (see <https://example.com>).\nDone.',
            );
        });

        test('keeps a paren that belongs to the URL inside the brackets', () => {
            expect(textOf('See https://en.wikipedia.org/wiki/Foo_(bar)\nDone.')).toBe(
                'See <https://en.wikipedia.org/wiki/Foo_(bar)>\nDone.',
            );
        });

        test('does not let the other fence character close a fenced code block', () => {
            const body = '```\n~~~\ncurl https://example.com/api\n```\nDone.';
            expect(textOf(body)).toBe(body);
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
