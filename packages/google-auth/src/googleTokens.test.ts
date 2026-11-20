import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';

import { parseGoogleTokens, serializeGoogleTokens } from './googleTokens.js';

const ENTRY = { refreshToken: 'refresh-sentinel', scopes: ['a', 'b'] };

test('no value holds no account, and a dictionary round-trips', () => {
    expect(parseGoogleTokens(undefined, 'TOKENS').size).toBe(0);
    expect(parseGoogleTokens('', 'TOKENS').size).toBe(0);

    const tokens = parseGoogleTokens(JSON.stringify({ 'me@example.com': ENTRY }), 'TOKENS');

    expect(Object.fromEntries(tokens)).toEqual({ 'me@example.com': ENTRY });
    expect(parseGoogleTokens(serializeGoogleTokens(tokens), 'TOKENS')).toEqual(tokens);
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
