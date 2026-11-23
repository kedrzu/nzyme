import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyPage, SpotifyTopListParams, SpotifyTrack } from '../SpotifyTypes.js';
import { mapSpotifyPage, mapSpotifyTrack } from './spotifyMappers.js';

/** Lists the account's most listened-to tracks (`GET /me/top/tracks`). */
export async function spotifyTopTracksList(
    api: SpotifyApi,
    params: SpotifyTopListParams = {},
): Promise<SpotifyPage<SpotifyTrack>> {
    const { limit, offset } = params;
    const result = await api({
        method: 'GET',
        path: '/me/top/tracks',
        query: { time_range: `${params.range ?? 'medium'}_term`, limit, offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, mapSpotifyTrack);
        default:
            throw new SpotifyError({ operation: 'top tracks read', status: result.status });
    }
}
