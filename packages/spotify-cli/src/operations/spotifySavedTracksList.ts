import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyEntry, SpotifyOffsetParams, SpotifyPage, SpotifyTrack } from '../SpotifyTypes.js';
import { mapSpotifyPage, mapSpotifyTrack } from './spotifyMappers.js';

/** Lists the tracks the account saved, newest first (`GET /me/tracks`). */
export async function spotifySavedTracksList(
    api: SpotifyApi,
    params: SpotifyOffsetParams = {},
): Promise<SpotifyPage<SpotifyEntry<SpotifyTrack>>> {
    const result = await api({
        method: 'GET',
        path: '/me/tracks',
        query: { limit: params.limit, offset: params.offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, saved =>
                saved.track ? { item: mapSpotifyTrack(saved.track), at: saved.added_at ?? '' } : undefined,
            );
        default:
            throw new SpotifyError({ operation: 'saved tracks read', status: result.status });
    }
}
