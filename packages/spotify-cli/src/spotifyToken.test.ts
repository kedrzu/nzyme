import { expect, test } from 'bun:test';

import type { SpotifyToken } from './spotifyToken.js';
import { parseSpotifyToken } from './spotifyToken.js';

const VALID: SpotifyToken = {
    refreshToken: 'refresh-token-sentinel-0f3a',
    scopes: ['user-top-read'],
    userId: 'owner',
    signedInAt: '2026-11-01T10:00:00.000Z',
};

test('parses the stored token', () => {
    const parsed = parseSpotifyToken({ value: JSON.stringify(VALID), secretName: 'SPOTIFY_TOKEN', signInCommand: 'x' });
    expect(parsed).toEqual(VALID);
});

test.each<[string, string]>([
    ['not JSON', `{"refreshToken":"${VALID.refreshToken}"`],
    ['an array', JSON.stringify([VALID])],
    ['an empty refresh token', JSON.stringify({ ...VALID, refreshToken: '' })],
    ['a scope that is not a string', JSON.stringify({ ...VALID, scopes: ['user-top-read', 1] })],
    ['a date that does not parse', JSON.stringify({ ...VALID, signedInAt: 'yesterday' })],
    ['no user id', JSON.stringify({ ...VALID, userId: undefined })],
])('refuses %s, naming the secret and the sign-in command but never the value', (_, value) => {
    const parse = () => parseSpotifyToken({ value, secretName: 'SPOTIFY_TOKEN', signInCommand: 'nzyme spotify auth' });

    expect(parse).toThrow('SPOTIFY_TOKEN does not hold a Spotify token');
    expect(parse).toThrow('Sign in again with `nzyme spotify auth`.');
    expect(parse).not.toThrow(VALID.refreshToken);
});
