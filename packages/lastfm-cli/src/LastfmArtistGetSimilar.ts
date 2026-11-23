import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmArtistLookup } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount } from './utils/lastfmJson.js';
import { artistLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseLastfmItems, parseNamedItem } from './utils/parseLastfmItems.js';

const METHOD = 'artist.getSimilar';

/** Params of {@link LastfmArtistGetSimilar}. */
export type LastfmArtistGetSimilarParams = LastfmArtistLookup & {
    /** How many similar artists to return; Last.fm's default is 100. */
    limit?: number;
};

/** Artists similar to one artist, most similar first. */
export interface LastfmArtistGetSimilarResult {
    /** The artist Last.fm resolved the lookup to; `null` when it did not say. */
    artist: string | null;
    items: LastfmSimilarArtist[];
}

/** An artist similar to the one looked up. */
export interface LastfmSimilarArtist {
    name: string;
    mbid: string | null;
    url: string | null;
    /** The similarity, from 0 to 1. */
    match: number;
}

/**
 * `artist.getSimilar`: artists similar to an artist.
 * @returns `null` when Last.fm does not know the artist
 */
export const LastfmArtistGetSimilar = defineEndpoint<LastfmArtistGetSimilarParams, LastfmArtistGetSimilarResult | null>(
    {
        request: params => ({ url: '', query: { method: METHOD, ...artistLookupQuery(params), limit: params.limit } }),
        response: async response => {
            const body = await readLastfmBody(response, METHOD);
            if (body === null) {
                return null;
            }

            const similar = readPath(body, 'similarartists');
            return {
                artist: textOf(readPath(similar, '@attr', 'artist')),
                items: parseLastfmItems(readPath(similar, 'artist'), item => {
                    const artist = parseNamedItem(item);
                    return artist && { ...artist, match: toCount(item.match) };
                }),
            };
        },
    },
);
