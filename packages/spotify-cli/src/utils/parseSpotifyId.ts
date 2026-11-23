import { UsageError } from '@nzyme/cli-core';

/** What an id can name in the commands. */
export type SpotifyIdType = 'artist' | 'album' | 'playlist';

const ID = /^[A-Za-z0-9]+$/;
const URI = /^spotify:([a-z]+):([A-Za-z0-9]+)$/;

/**
 * The bare id of a Spotify item, from the id itself, a `spotify:<type>:<id>` URI or an
 * `https://open.spotify.com/<type>/<id>` link (with or without an `intl-xx/` segment and a query).
 * Anything else, or an item of another type, is a `UsageError`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyId(value: string, type: SpotifyIdType): string {
    const text = value.trim();
    if (ID.test(text)) {
        return text;
    }

    const named = parseSpotifyReference(text);
    if (!named) {
        throw new UsageError(`Not a Spotify ${type} id, URI or link: ${value}`);
    }

    if (named.type !== type) {
        throw new UsageError(`Expected a Spotify ${type}, got a ${named.type}: ${value}`);
    }

    return named.id;
}

/**
 * The type and id a `spotify:<type>:<id>` URI or an `open.spotify.com` link names, or `undefined` for
 * anything else (a bare id names no type).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyReference(value: string): { type: string; id: string } | undefined {
    const text = value.trim();
    return parseUri(text) ?? parseLink(text);
}

function parseUri(text: string) {
    const match = URI.exec(text);
    return match?.[1] && match[2] ? { type: match[1], id: match[2] } : undefined;
}

function parseLink(text: string) {
    const url = URL.canParse(text) ? new URL(text) : undefined;
    if (url?.hostname !== 'open.spotify.com') {
        return undefined;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0]?.startsWith('intl-')) {
        segments.shift();
    }

    const [type, id] = segments;
    return type && id && ID.test(id) ? { type, id } : undefined;
}
