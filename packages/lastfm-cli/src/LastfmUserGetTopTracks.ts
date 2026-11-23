import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging, LastfmPeriod, LastfmUserTopItem } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'user.getTopTracks';

/** Params of {@link LastfmUserGetTopTracks}. */
export interface LastfmUserGetTopTracksParams extends LastfmPaging {
    /** The Last.fm user name. */
    user: string;
    /** `overall` when omitted. */
    period?: LastfmPeriod;
}

/** A user's most played tracks, top first. */
export interface LastfmUserGetTopTracksResult {
    items: LastfmUserTopItem[];
}

/**
 * `user.getTopTracks`: a user's most played tracks in a period.
 * @returns `null` when Last.fm does not know the user
 */
export const LastfmUserGetTopTracks = defineEndpoint<LastfmUserGetTopTracksParams, LastfmUserGetTopTracksResult | null>(
    {
        request: params => ({
            url: '',
            query: { method: METHOD, user: params.user, period: params.period, limit: params.limit, page: params.page },
        }),
        response: async response => {
            const body = await readLastfmBody(response, METHOD);
            if (body === null) {
                return null;
            }

            return {
                items: parseLastfmItems(readPath(body, 'toptracks', 'track'), item => {
                    const track = parseItemRef(item);
                    return track && { ...track, rank: rankOf(item), playcount: toCount(item.playcount) };
                }),
            };
        },
    },
);
