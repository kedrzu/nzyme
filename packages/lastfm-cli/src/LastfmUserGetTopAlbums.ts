import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging, LastfmPeriod, LastfmUserTopItem } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'user.getTopAlbums';

/** Params of {@link LastfmUserGetTopAlbums}. */
export interface LastfmUserGetTopAlbumsParams extends LastfmPaging {
    /** The Last.fm user name. */
    user: string;
    /** `overall` when omitted. */
    period?: LastfmPeriod;
}

/** A user's most played albums, top first. */
export interface LastfmUserGetTopAlbumsResult {
    items: LastfmUserTopItem[];
}

/**
 * `user.getTopAlbums`: a user's most played albums in a period.
 * @returns `null` when Last.fm does not know the user
 */
export const LastfmUserGetTopAlbums = defineEndpoint<LastfmUserGetTopAlbumsParams, LastfmUserGetTopAlbumsResult | null>(
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
                items: parseLastfmItems(readPath(body, 'topalbums', 'album'), item => {
                    const album = parseItemRef(item);
                    return album && { ...album, rank: rankOf(item), playcount: toCount(item.playcount) };
                }),
            };
        },
    },
);
