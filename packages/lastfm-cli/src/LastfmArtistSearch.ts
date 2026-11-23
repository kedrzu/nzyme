import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseLastfmItems, parseNamedItem } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'artist.search';

/** Params of {@link LastfmArtistSearch}. */
export interface LastfmArtistSearchParams extends LastfmPaging {
    /** The name to search for. */
    artist: string;
}

/** Artists matching a search, best match first. */
export interface LastfmArtistSearchResult {
    /** How many artists match across all pages. */
    total: number;
    items: LastfmArtistSearchMatch[];
}

/** An artist matching a search. */
export interface LastfmArtistSearchMatch {
    name: string;
    mbid: string | null;
    url: string | null;
    listeners: number;
}

/** `artist.search`: artists by name. */
export const LastfmArtistSearch = defineEndpoint<LastfmArtistSearchParams, LastfmArtistSearchResult>({
    request: params => ({
        url: '',
        query: { method: METHOD, artist: params.artist, limit: params.limit, page: params.page },
    }),
    response: async response => {
        const results = readPath(await readListedLastfmBody(response, METHOD), 'results');
        return {
            total: toCount(readPath(results, 'opensearch:totalResults')),
            items: parseLastfmItems(readPath(results, 'artistmatches', 'artist'), item => {
                const artist = parseNamedItem(item);
                return artist && { ...artist, listeners: toCount(item.listeners) };
            }),
        };
    },
});
