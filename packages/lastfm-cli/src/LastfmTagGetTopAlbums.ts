import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'tag.getTopAlbums';

/** Params of {@link LastfmTagGetTopAlbums}. */
export interface LastfmTagGetTopAlbumsParams extends LastfmPaging {
    tag: string;
}

/** The albums most tagged with a tag, top first. */
export interface LastfmTagGetTopAlbumsResult {
    items: LastfmTagTopAlbum[];
}

/** One of a tag's top albums. */
export interface LastfmTagTopAlbum extends LastfmItemRef {
    /** The 1-based position across all pages. */
    rank: number;
}

/**
 * `tag.getTopAlbums`: the albums most tagged with a tag.
 * @returns `null` when Last.fm does not know the tag
 */
export const LastfmTagGetTopAlbums = defineEndpoint<LastfmTagGetTopAlbumsParams, LastfmTagGetTopAlbumsResult | null>({
    request: params => ({
        url: '',
        query: { method: METHOD, tag: params.tag, limit: params.limit, page: params.page },
    }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        return {
            items: parseLastfmItems(readPath(body, 'albums', 'album'), item => {
                const album = parseItemRef(item);
                return album && { ...album, rank: rankOf(item) };
            }),
        };
    },
});
