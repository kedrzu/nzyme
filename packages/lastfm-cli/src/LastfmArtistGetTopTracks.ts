import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmArtistLookup, LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount } from './utils/lastfmJson.js';
import { artistLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseItemRef, parseLastfmItems, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'artist.getTopTracks';

/** Params of {@link LastfmArtistGetTopTracks}. */
export type LastfmArtistGetTopTracksParams = LastfmArtistLookup & LastfmPaging;

/** An artist's most played tracks, most played first. */
export interface LastfmArtistGetTopTracksResult {
    /** The artist Last.fm resolved the lookup to; `null` when it did not say. */
    artist: string | null;
    items: LastfmArtistTopTrack[];
}

/** One of an artist's top tracks. */
export interface LastfmArtistTopTrack extends LastfmItemRef {
    /** The 1-based position across all pages. */
    rank: number;
    playcount: number;
    listeners: number;
}

/**
 * `artist.getTopTracks`: an artist's most played tracks.
 * @returns `null` when Last.fm does not know the artist
 */
export const LastfmArtistGetTopTracks = defineEndpoint<
    LastfmArtistGetTopTracksParams,
    LastfmArtistGetTopTracksResult | null
>({
    request: params => ({
        url: '',
        query: { method: METHOD, ...artistLookupQuery(params), limit: params.limit, page: params.page },
    }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const tracks = readPath(body, 'toptracks');
        return {
            artist: textOf(readPath(tracks, '@attr', 'artist')),
            items: parseLastfmItems(readPath(tracks, 'track'), item => {
                const track = parseItemRef(item);
                return (
                    track && {
                        ...track,
                        rank: rankOf(item),
                        playcount: toCount(item.playcount),
                        listeners: toCount(item.listeners),
                    }
                );
            }),
        };
    },
});
