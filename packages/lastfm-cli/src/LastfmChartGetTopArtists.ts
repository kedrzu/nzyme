import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseLastfmItems, parseNamedItem } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'chart.getTopArtists';

/** Params of {@link LastfmChartGetTopArtists}. */
export type LastfmChartGetTopArtistsParams = LastfmPaging;

/** The most played artists on Last.fm this week, top first. */
export interface LastfmChartGetTopArtistsResult {
    items: LastfmChartArtist[];
}

/** An artist on the chart. */
export interface LastfmChartArtist {
    name: string;
    mbid: string | null;
    url: string | null;
    playcount: number;
    listeners: number;
}

/** `chart.getTopArtists`: the most played artists on Last.fm. */
export const LastfmChartGetTopArtists = defineEndpoint<LastfmChartGetTopArtistsParams, LastfmChartGetTopArtistsResult>({
    request: params => ({ url: '', query: { method: METHOD, limit: params.limit, page: params.page } }),
    response: async response => {
        const body = await readListedLastfmBody(response, METHOD);
        return {
            items: parseLastfmItems(readPath(body, 'artists', 'artist'), item => {
                const artist = parseNamedItem(item);
                return artist && { ...artist, playcount: toCount(item.playcount), listeners: toCount(item.listeners) };
            }),
        };
    },
});
