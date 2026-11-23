import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';

import { parseGoogleTokens } from './googleTokens.js';

const ENTRY = { refreshToken: 'refresh-sentinel', scopes: ['a', 'b'] };

test('no value, or an empty one, holds no account', () => {
    expect(parseGoogleTokens(undefined, 'TOKENS').size).toBe(0);
    expect(parseGoogleTokens('', 'TOKENS').size).toBe(0);
});

test.each([
    ['not JSON', '{"me@example.com": refresh-sentinel'],
    ['an array', JSON.stringify([ENTRY])],
    ['an email holding a string', JSON.stringify({ 'me@example.com': 'refresh-sentinel' })],
    ['an entry without scopes', JSON.stringify({ 'me@example.com': { refreshToken: 'refresh-sentinel' } })],
    ['an upper-cased email', JSON.stringify({ 'Me@example.com': ENTRY })],
    ['a key that is no email', JSON.stringify({ 'refresh-sentinel': ENTRY })],
])('%s is refused naming the secret, never quoting the value', (_, value) => {
    const parse = () => parseGoogleTokens(value, 'TOKENS');

    expect(parse).toThrow(UsageError);
    // The message names the secret and quotes nothing of the value.
    expect(parse).toThrow(/^(?![\s\S]*refresh-sentinel)TOKENS does not hold Google tokens/);
});
