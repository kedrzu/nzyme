import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyArtist, SpotifyPage, SpotifyTopListParams } from '../SpotifyTypes.js';
import { mapSpotifyArtist, mapSpotifyPage } from './spotifyMappers.js';

/** Lists the account's most listened-to artists (`GET /me/top/artists`). */
export async function spotifyTopArtistsList(
    api: SpotifyApi,
    params: SpotifyTopListParams = {},
): Promise<SpotifyPage<SpotifyArtist>> {
    const { limit, offset } = params;
    const result = await api({
        method: 'GET',
        path: '/me/top/artists',
        query: { time_range: `${params.range ?? 'medium'}_term`, limit, offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, mapSpotifyArtist);
        default:
            throw new SpotifyError({ operation: 'top artists read', status: result.status });
    }
}
