import { UsageError } from '@nzyme/cli-core';

import { parseSpotifyReference } from './parseSpotifyId.js';

/**
 * The `spotify:track:<id>` or `spotify:episode:<id>` URI of a track or episode, from a URI or an
 * `open.spotify.com` link. A bare id is refused: it does not say which of the two it is.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyPlayableUri(value: string): string {
    const named = parseSpotifyReference(value);
    if (named?.type !== 'track' && named?.type !== 'episode') {
        throw new UsageError(`Not a Spotify track or episode URI or link: ${value}`);
    }

    return `spotify:${named.type}:${named.id}`;
}
