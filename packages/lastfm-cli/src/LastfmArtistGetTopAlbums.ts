import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmArtistLookup, LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount } from './utils/lastfmJson.js';
import { artistLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';

const METHOD = 'artist.getTopAlbums';

/** Params of {@link LastfmArtistGetTopAlbums}. */
export type LastfmArtistGetTopAlbumsParams = LastfmArtistLookup & LastfmPaging;

/** An artist's most played albums, most played first. */
export interface LastfmArtistGetTopAlbumsResult {
    /** The artist Last.fm resolved the lookup to; `null` when it did not say. */
    artist: string | null;
    items: LastfmArtistTopAlbum[];
}

/** One of an artist's top albums. */
export interface LastfmArtistTopAlbum extends LastfmItemRef {
    playcount: number;
}

/**
 * `artist.getTopAlbums`: an artist's most played albums.
 * @returns `null` when Last.fm does not know the artist
 */
export const LastfmArtistGetTopAlbums = defineEndpoint<
    LastfmArtistGetTopAlbumsParams,
    LastfmArtistGetTopAlbumsResult | null
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

        const albums = readPath(body, 'topalbums');
        return {
            artist: textOf(readPath(albums, '@attr', 'artist')),
            items: parseLastfmItems(readPath(albums, 'album'), item => {
                const album = parseItemRef(item);
                return album && { ...album, playcount: toCount(item.playcount) };
            }),
        };
    },
});
