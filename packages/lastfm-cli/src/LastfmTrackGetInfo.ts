import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { LastfmItemRef, LastfmTagRef, LastfmTrackLookup } from './LastfmTypes.js';
import { LastfmError } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount, toDuration, toMbid } from './utils/lastfmJson.js';
import { trackLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseItemRef, parseTagRefs } from './utils/parseLastfmItems.js';

const METHOD = 'track.getInfo';

/** Params of {@link LastfmTrackGetInfo}. */
export type LastfmTrackGetInfoParams = LastfmTrackLookup;

/** A track's profile. `name` and `artist.name` are what Last.fm resolved the lookup to. */
export interface LastfmTrackGetInfoResult extends LastfmItemRef {
    /** In seconds; `null` when Last.fm does not know it. */
    duration: number | null;
    listeners: number;
    playcount: number;
    /** The album Last.fm files the track under; `null` when it files it under none. */
    album: LastfmTrackAlbum | null;
    /** The top tags. */
    tags: LastfmTagRef[];
    /** The wiki summary as Last.fm sends it: HTML, ending in a "Read more" link. */
    summary: string | null;
}

/** The album of a track. */
export interface LastfmTrackAlbum {
    name: string;
    mbid: string | null;
    url: string | null;
}

/**
 * `track.getInfo`: a track's profile, stats, album, tags and wiki.
 * @returns `null` when Last.fm does not know the track
 */
export const LastfmTrackGetInfo = defineEndpoint<LastfmTrackGetInfoParams, LastfmTrackGetInfoResult | null>({
    request: params => ({ url: '', query: { method: METHOD, ...trackLookupQuery(params) } }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const track = readPath(body, 'track');
        const ref = isPlainObject(track) ? parseItemRef(track) : null;
        if (ref === null) {
            // A body without the entity is malformed, not "not found" (error 6, above).
            throw new LastfmError({ method: METHOD, code: null, status: response.status });
        }

        // Unlike every other method, track.getInfo sends the duration in milliseconds.
        const durationMs = toDuration(readPath(track, 'duration'));
        return {
            ...ref,
            duration: durationMs === null ? null : Math.round(durationMs / 1000),
            listeners: toCount(readPath(track, 'listeners')),
            playcount: toCount(readPath(track, 'playcount')),
            album: parseTrackAlbum(readPath(track, 'album')),
            tags: parseTagRefs(readPath(track, 'toptags')),
            summary: textOf(readPath(track, 'wiki', 'summary')),
        };
    },
});

function parseTrackAlbum(album: unknown): LastfmTrackAlbum | null {
    const name = textOf(readPath(album, 'title'));
    return name === null ? null : { name, mbid: toMbid(readPath(album, 'mbid')), url: textOf(readPath(album, 'url')) };
}
