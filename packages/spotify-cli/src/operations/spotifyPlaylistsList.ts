import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyOffsetParams, SpotifyPage, SpotifyPlaylist } from '../SpotifyTypes.js';
import { mapSpotifyPage, mapSpotifyPlaylist } from './spotifyMappers.js';

/** Lists the playlists the account owns or follows (`GET /me/playlists`). */
export async function spotifyPlaylistsList(
    api: SpotifyApi,
    params: SpotifyOffsetParams = {},
): Promise<SpotifyPage<SpotifyPlaylist>> {
    const result = await api({
        method: 'GET',
        path: '/me/playlists',
        query: { limit: params.limit, offset: params.offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, mapSpotifyPlaylist);
        default:
            throw new SpotifyError({ operation: 'playlists read', status: result.status });
    }
}
