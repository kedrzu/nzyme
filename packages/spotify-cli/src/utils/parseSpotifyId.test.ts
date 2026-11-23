import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';

import { parseSpotifyId } from './parseSpotifyId.js';

const ID = '4Z8W4fKeB5YxbusRsdQVPb';

test.each([
    ['a bare id', ID],
    ['a URI', `spotify:artist:${ID}`],
    ['a link with a query', `https://open.spotify.com/artist/${ID}?si=abc123`],
    ['a localised link', `https://open.spotify.com/intl-pl/artist/${ID}?si=abc123`],
    ['a padded id', `  ${ID}\n`],
])('reads the id from %s', (_name, value) => {
    expect(parseSpotifyId(value, 'artist')).toBe(ID);
});

test.each([
    ['a URI of another type', `spotify:track:${ID}`, 'Expected a Spotify artist, got a track'],
    ['a link of another type', `https://open.spotify.com/album/${ID}`, 'Expected a Spotify artist, got a album'],
    ['a foreign link', `https://example.com/artist/${ID}`, 'Not a Spotify artist id'],
    ['text', 'not an id!', 'Not a Spotify artist id'],
])('refuses %s with a UsageError', (_name, value, message) => {
    expect(() => parseSpotifyId(value, 'artist')).toThrow(UsageError);
    expect(() => parseSpotifyId(value, 'artist')).toThrow(message);
});
