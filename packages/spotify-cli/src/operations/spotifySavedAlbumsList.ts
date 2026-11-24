import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyAlbum, SpotifyEntry, SpotifyOffsetParams, SpotifyPage } from '../SpotifyTypes.js';
import { mapSpotifyAlbum, mapSpotifyPage } from './spotifyMappers.js';

/** Lists the albums the account saved, newest first (`GET /me/albums`). */
export async function spotifySavedAlbumsList(
    api: SpotifyApi,
    params: SpotifyOffsetParams = {},
): Promise<SpotifyPage<SpotifyEntry<SpotifyAlbum>>> {
    const result = await api({
        method: 'GET',
        path: '/me/albums',
        query: { limit: params.limit, offset: params.offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, saved =>
                saved.album ? { item: mapSpotifyAlbum(saved.album), at: saved.added_at ?? '' } : undefined,
            );
        default:
            throw new SpotifyError({ operation: 'saved albums read', status: result.status });
    }
}
