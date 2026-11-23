import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath } from './utils/lastfmJson.js';
import { parseLastfmItems, parseNamedItem, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'tag.getTopArtists';

/** Params of {@link LastfmTagGetTopArtists}. */
export interface LastfmTagGetTopArtistsParams extends LastfmPaging {
    tag: string;
}

/** The artists most tagged with a tag, top first. */
export interface LastfmTagGetTopArtistsResult {
    items: LastfmTagTopArtist[];
}

/** One of a tag's top artists. */
export interface LastfmTagTopArtist {
    name: string;
    mbid: string | null;
    url: string | null;
    /** The 1-based position across all pages. */
    rank: number;
}

/**
 * `tag.getTopArtists`: the artists most tagged with a tag.
 * @returns `null` when Last.fm does not know the tag
 */
export const LastfmTagGetTopArtists = defineEndpoint<LastfmTagGetTopArtistsParams, LastfmTagGetTopArtistsResult | null>(
    {
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
                items: parseLastfmItems(readPath(body, 'topartists', 'artist'), item => {
                    const artist = parseNamedItem(item);
                    return artist && { ...artist, rank: rankOf(item) };
                }),
            };
        },
    },
);
