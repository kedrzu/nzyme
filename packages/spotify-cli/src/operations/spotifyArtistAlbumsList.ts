import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyAlbum, SpotifyOffsetParams, SpotifyPage } from '../SpotifyTypes.js';
import { mapSpotifyAlbum, mapSpotifyPage } from './spotifyMappers.js';

/** Params of {@link spotifyArtistAlbumsList}. */
export interface SpotifyArtistAlbumsParams extends SpotifyOffsetParams {
    /** The artist's id. */
    id: string;
}

/** Lists an artist's albums (`GET /artists/{id}/albums`); the limit is at most 10. */
export async function spotifyArtistAlbumsList(
    api: SpotifyApi,
    params: SpotifyArtistAlbumsParams,
): Promise<SpotifyPage<SpotifyAlbum>> {
    const result = await api({
        method: 'GET',
        path: '/artists/{id}/albums',
        pathParams: { id: params.id },
        query: { limit: params.limit, offset: params.offset },
    });
    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, mapSpotifyAlbum);
        default:
            throw new SpotifyError({ operation: 'artist albums read', status: result.status });
    }
}
