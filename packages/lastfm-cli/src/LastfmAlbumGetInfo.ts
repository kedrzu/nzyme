import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { LastfmAlbumLookup, LastfmArtistRef, LastfmItemRef, LastfmTagRef } from './LastfmTypes.js';
import { LastfmError } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount, toDuration } from './utils/lastfmJson.js';
import { albumLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseItemRef, parseLastfmItems, parseTagRefs, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'album.getInfo';

/** Params of {@link LastfmAlbumGetInfo}. */
export type LastfmAlbumGetInfoParams = LastfmAlbumLookup;

/** An album's profile and track list. */
export interface LastfmAlbumGetInfoResult {
    /** The title Last.fm resolved the lookup to. */
    name: string;
    /** The album artist; Last.fm gives only the name. */
    artist: LastfmArtistRef;
    mbid: string | null;
    url: string | null;
    listeners: number;
    playcount: number;
    /** The tracks in album order; empty when Last.fm has no track list. */
    tracks: LastfmAlbumTrack[];
    /** The top tags. */
    tags: LastfmTagRef[];
    /** The wiki summary as Last.fm sends it: HTML, ending in a "Read more" link. */
    summary: string | null;
}

/** A track on an album. */
export interface LastfmAlbumTrack extends LastfmItemRef {
    /** The 1-based position on the album. */
    rank: number;
    /** In seconds; `null` when Last.fm does not know it. */
    duration: number | null;
}

/**
 * `album.getInfo`: an album's profile, stats, tags, track list and wiki.
 * @returns `null` when Last.fm does not know the album
 */
export const LastfmAlbumGetInfo = defineEndpoint<LastfmAlbumGetInfoParams, LastfmAlbumGetInfoResult | null>({
    request: params => ({ url: '', query: { method: METHOD, ...albumLookupQuery(params) } }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const album = readPath(body, 'album');
        const ref = isPlainObject(album) ? parseItemRef(album) : null;
        if (ref === null) {
            // A body without the entity is malformed, not "not found" (error 6, above).
            throw new LastfmError({ method: METHOD, code: null, status: response.status });
        }

        return {
            ...ref,
            listeners: toCount(readPath(album, 'listeners')),
            playcount: toCount(readPath(album, 'playcount')),
            tracks: parseLastfmItems(readPath(album, 'tracks', 'track'), item => {
                const track = parseItemRef(item);
                return track && { ...track, rank: rankOf(item), duration: toDuration(item.duration) };
            }),
            tags: parseTagRefs(readPath(album, 'tags')),
            summary: textOf(readPath(album, 'wiki', 'summary')),
        };
    },
});
