import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, toDuration } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'tag.getTopTracks';

/** Params of {@link LastfmTagGetTopTracks}. */
export interface LastfmTagGetTopTracksParams extends LastfmPaging {
    tag: string;
}

/** The tracks most tagged with a tag, top first. */
export interface LastfmTagGetTopTracksResult {
    items: LastfmTagTopTrack[];
}

/** One of a tag's top tracks. */
export interface LastfmTagTopTrack extends LastfmItemRef {
    /** The 1-based position across all pages. */
    rank: number;
    /** In seconds; `null` when Last.fm does not know it. */
    duration: number | null;
}

/**
 * `tag.getTopTracks`: the tracks most tagged with a tag.
 * @returns `null` when Last.fm does not know the tag
 */
export const LastfmTagGetTopTracks = defineEndpoint<LastfmTagGetTopTracksParams, LastfmTagGetTopTracksResult | null>({
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
            items: parseLastfmItems(readPath(body, 'tracks', 'track'), item => {
                const track = parseItemRef(item);
                return track && { ...track, rank: rankOf(item), duration: toDuration(item.duration) };
            }),
        };
    },
});
