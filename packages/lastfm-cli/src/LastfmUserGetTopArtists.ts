import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmPaging, LastfmPeriod } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, toCount } from './utils/lastfmJson.js';
import { parseLastfmItems, parseNamedItem, rankOf } from './utils/parseLastfmItems.js';

const METHOD = 'user.getTopArtists';

/** Params of {@link LastfmUserGetTopArtists}. */
export interface LastfmUserGetTopArtistsParams extends LastfmPaging {
    /** The Last.fm user name. */
    user: string;
    /** `overall` when omitted. */
    period?: LastfmPeriod;
}

/** A user's most played artists, top first. */
export interface LastfmUserGetTopArtistsResult {
    items: LastfmUserTopArtist[];
}

/** One of a user's top artists. */
export interface LastfmUserTopArtist {
    name: string;
    mbid: string | null;
    url: string | null;
    /** The 1-based position across all pages. */
    rank: number;
    /** The user's plays in the period. */
    playcount: number;
}

/**
 * `user.getTopArtists`: a user's most played artists in a period.
 * @returns `null` when Last.fm does not know the user
 */
export const LastfmUserGetTopArtists = defineEndpoint<
    LastfmUserGetTopArtistsParams,
    LastfmUserGetTopArtistsResult | null
>({
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
            items: parseLastfmItems(readPath(body, 'topartists', 'artist'), item => {
                const artist = parseNamedItem(item);
                return artist && { ...artist, rank: rankOf(item), playcount: toCount(item.playcount) };
            }),
        };
    },
});
