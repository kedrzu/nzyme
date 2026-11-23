import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyCursorPage, SpotifyEntry, SpotifyTrack } from '../SpotifyTypes.js';
import { mapSpotifyTrack } from './spotifyMappers.js';

/** Params of {@link spotifyRecentlyPlayedList}. */
export interface SpotifyRecentlyPlayedParams {
    /** At most 50. */
    limit?: number;
    /** The cursor of an earlier answer: lists what was played before it (a Unix time in ms). */
    before?: string;
}

/** Lists the tracks played last, newest first (`GET /me/player/recently-played`). */
export async function spotifyRecentlyPlayedList(
    api: SpotifyApi,
    params: SpotifyRecentlyPlayedParams = {},
): Promise<SpotifyCursorPage<SpotifyEntry<SpotifyTrack>>> {
    const result = await api({
        method: 'GET',
        path: '/me/player/recently-played',
        query: { limit: params.limit, before: params.before == null ? undefined : Number(params.before) },
    });
    switch (result.status) {
        case 200: {
            const items: SpotifyEntry<SpotifyTrack>[] = [];
            for (const play of result.data.items ?? []) {
                if (play?.track) {
                    items.push({ item: mapSpotifyTrack(play.track), at: play.played_at ?? '' });
                }
            }

            return { items, cursor: result.data.next ? result.data.cursors?.before : undefined };
        }
        default:
            throw new SpotifyError({ operation: 'recently played read', status: result.status });
    }
}
