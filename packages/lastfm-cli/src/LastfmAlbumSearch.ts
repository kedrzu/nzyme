import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'album.search';

/** Params of {@link LastfmAlbumSearch}. */
export interface LastfmAlbumSearchParams extends LastfmPaging {
    /** The title to search for. */
    album: string;
}

/** Albums matching a search, best match first; their artists carry only a name. */
export interface LastfmAlbumSearchResult {
    /** How many albums match across all pages. */
    total: number;
    items: LastfmItemRef[];
}

/** `album.search`: albums by title. */
export const LastfmAlbumSearch = defineEndpoint<LastfmAlbumSearchParams, LastfmAlbumSearchResult>({
    request: params => ({
        url: '',
        query: { method: METHOD, album: params.album, limit: params.limit, page: params.page },
    }),
    response: async response => {
        const results = readPath(await readListedLastfmBody(response, METHOD), 'results');
        return {
            total: toCount(readPath(results, 'opensearch:totalResults')),
            items: parseLastfmItems(readPath(results, 'albummatches', 'album'), parseItemRef),
        };
    },
});
