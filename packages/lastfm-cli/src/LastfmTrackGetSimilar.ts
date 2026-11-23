import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmTrackLookup } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount, toDuration } from './utils/lastfmJson.js';
import { trackLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';

const METHOD = 'track.getSimilar';

/** Params of {@link LastfmTrackGetSimilar}. */
export type LastfmTrackGetSimilarParams = LastfmTrackLookup & {
    /** How many similar tracks to return; Last.fm's default is 100. */
    limit?: number;
};

/** Tracks similar to one track, most similar first. */
export interface LastfmTrackGetSimilarResult {
    /** The artist Last.fm resolved the lookup to; `null` when it did not say. */
    artist: string | null;
    items: LastfmSimilarTrack[];
}

/** A track similar to the one looked up. */
export interface LastfmSimilarTrack extends LastfmItemRef {
    /** The similarity, from 0 to 1. */
    match: number;
    playcount: number;
    /** In seconds; `null` when Last.fm does not know it. */
    duration: number | null;
}

/**
 * `track.getSimilar`: tracks similar to a track.
 * @returns `null` when Last.fm does not know the track
 */
export const LastfmTrackGetSimilar = defineEndpoint<LastfmTrackGetSimilarParams, LastfmTrackGetSimilarResult | null>({
    request: params => ({ url: '', query: { method: METHOD, ...trackLookupQuery(params), limit: params.limit } }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const similar = readPath(body, 'similartracks');
        return {
            artist: textOf(readPath(similar, '@attr', 'artist')),
            items: parseLastfmItems(readPath(similar, 'track'), item => {
                const track = parseItemRef(item);
                return (
                    track && {
                        ...track,
                        match: toCount(item.match),
                        playcount: toCount(item.playcount),
                        duration: toDuration(item.duration),
                    }
                );
            }),
        };
    },
});
