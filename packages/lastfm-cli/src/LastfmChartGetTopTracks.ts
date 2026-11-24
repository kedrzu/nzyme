import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef, LastfmPaging } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'chart.getTopTracks';

/** Params of {@link LastfmChartGetTopTracks}. */
export type LastfmChartGetTopTracksParams = LastfmPaging;

/** The most played tracks on Last.fm this week, top first. */
export interface LastfmChartGetTopTracksResult {
    items: LastfmChartTrack[];
}

/** A track on the chart. */
export interface LastfmChartTrack extends LastfmItemRef {
    playcount: number;
    listeners: number;
}

/** `chart.getTopTracks`: the most played tracks on Last.fm. */
export const LastfmChartGetTopTracks = defineEndpoint<LastfmChartGetTopTracksParams, LastfmChartGetTopTracksResult>({
    request: params => ({ url: '', query: { method: METHOD, limit: params.limit, page: params.page } }),
    response: async response => {
        const body = await readListedLastfmBody(response, METHOD);
        return {
            items: parseLastfmItems(readPath(body, 'tracks', 'track'), item => {
                const track = parseItemRef(item);
                return track && { ...track, playcount: toCount(item.playcount), listeners: toCount(item.listeners) };
            }),
        };
    },
});
