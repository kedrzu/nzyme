import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging, LastfmTagRef } from './LastfmTypes.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseLastfmItems, parseTagRef } from './utils/parseLastfmItems.js';
import { readListedLastfmBody } from './utils/readListedLastfmBody.js';

const METHOD = 'chart.getTopTags';

/** Params of {@link LastfmChartGetTopTags}. */
export type LastfmChartGetTopTagsParams = LastfmPaging;

/** The most used tags on Last.fm, top first. */
export interface LastfmChartGetTopTagsResult {
    items: LastfmChartTag[];
}

/** A tag on the chart. */
export interface LastfmChartTag extends LastfmTagRef {
    /** How many users applied the tag. */
    reach: number;
    /** How many times the tag was applied. */
    taggings: number;
}

/** `chart.getTopTags`: the most used tags on Last.fm. */
export const LastfmChartGetTopTags = defineEndpoint<LastfmChartGetTopTagsParams, LastfmChartGetTopTagsResult>({
    request: params => ({ url: '', query: { method: METHOD, limit: params.limit, page: params.page } }),
    response: async response => {
        const body = await readListedLastfmBody(response, METHOD);
        return {
            items: parseLastfmItems(readPath(body, 'tags', 'tag'), item => {
                const tag = parseTagRef(item);
                return tag && { ...tag, reach: toCount(item.reach), taggings: toCount(item.taggings) };
            }),
        };
    },
});
