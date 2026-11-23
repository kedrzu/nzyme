import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'track.search';

/** Params of {@link LastfmTrackSearch}. */
export interface LastfmTrackSearchParams extends LastfmPaging {
    /** The title to search for. */
    track: string;
    /** Narrows the search to an artist's tracks. */
    artist?: string;
}

/** Tracks matching a search, best match first. */
export interface LastfmTrackSearchResult {
    /** How many tracks match across all pages. */
    total: number;
    items: LastfmTrackSearchMatch[];
}

/** A track matching a search; its artist carries only a name. */
export interface LastfmTrackSearchMatch extends LastfmItemRef {
    listeners: number;
}

/** `track.search`: tracks by title, optionally by artist too. */
export const LastfmTrackSearch = defineEndpoint<LastfmTrackSearchParams, LastfmTrackSearchResult>({
    request: params => ({
        url: '',
        query: {
            method: METHOD,
            track: params.track,
            artist: params.artist,
            limit: params.limit,
            page: params.page,
        },
    }),
    response: async response => {
        const results = readPath(await readListedLastfmBody(response, METHOD), 'results');
        return {
            total: toCount(readPath(results, 'opensearch:totalResults')),
            items: parseLastfmItems(readPath(results, 'trackmatches', 'track'), item => {
                const track = parseItemRef(item);
                return track && { ...track, listeners: toCount(item.listeners) };
            }),
        };
    },
});
