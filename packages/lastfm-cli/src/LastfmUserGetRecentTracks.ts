import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import type { LastfmItemRef } from './LastfmTypes.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toMbid, toNumber } from './utils/lastfmJson.js';
import { parseItemRef, parseLastfmItems } from './utils/parseLastfmItems.js';

const METHOD = 'user.getRecentTracks';

/** Params of {@link LastfmUserGetRecentTracks}. */
export interface LastfmUserGetRecentTracksParams {
    /** The Last.fm user name. */
    user: string;
    /** Tracks per page, at most 200; Last.fm's default is 50. */
    limit?: number;
    /** The 1-based page. */
    page?: number;
    /** Only tracks played at or after this time. */
    from?: Date;
    /** Only tracks played at or before this time. */
    to?: Date;
}

/** A user's listening history, latest first; a track playing now comes first. */
export interface LastfmUserGetRecentTracksResult {
    items: LastfmRecentTrack[];
}

/** A track a user played or is playing. Its artist carries no `url`. */
export interface LastfmRecentTrack extends LastfmItemRef {
    /** The album the scrobble names; `null` when it names none. */
    album: LastfmRecentTrackAlbum | null;
    /** When the play was scrobbled; `null` for the track playing now. */
    playedAt: Date | null;
    /** Whether the user is listening to it right now. */
    nowPlaying: boolean;
}

/** The album of a scrobble, which Last.fm gives without a URL. */
export interface LastfmRecentTrackAlbum {
    name: string;
    mbid: string | null;
}

/**
 * `user.getRecentTracks`: the tracks a user played, and the one playing now.
 * @returns `null` when Last.fm does not know the user
 */
export const LastfmUserGetRecentTracks = defineEndpoint<
    LastfmUserGetRecentTracksParams,
    LastfmUserGetRecentTracksResult | null
>({
    request: params => ({
        url: '',
        query: {
            method: METHOD,
            user: params.user,
            limit: params.limit,
            page: params.page,
            from: params.from && toUnixSeconds(params.from),
            to: params.to && toUnixSeconds(params.to),
        },
    }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        return {
            items: parseLastfmItems(readPath(body, 'recenttracks', 'track'), item => {
                const track = parseItemRef(item);
                const playedAt = toNumber(readPath(item, 'date', 'uts'));
                return (
                    track && {
                        ...track,
                        album: parseAlbum(item.album),
                        playedAt: playedAt === null ? null : new Date(playedAt * 1000),
                        nowPlaying: readPath(item, '@attr', 'nowplaying') === 'true',
                    }
                );
            }),
        };
    },
});

function parseAlbum(album: unknown): LastfmRecentTrackAlbum | null {
    const name = textOf(album);
    return name === null ? null : { name, mbid: toMbid(readPath(album, 'mbid')) };
}

function toUnixSeconds(date: Date) {
    return Math.floor(date.getTime() / 1000);
}
