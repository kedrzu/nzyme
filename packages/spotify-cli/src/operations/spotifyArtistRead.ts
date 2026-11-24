import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyArtist } from '../SpotifyTypes.js';
import { mapSpotifyArtist } from './spotifyMappers.js';

/** Reads one artist by its id (`GET /artists/{id}`). */
export async function spotifyArtistRead(api: SpotifyApi, id: string): Promise<SpotifyArtist> {
    const result = await api({ method: 'GET', path: '/artists/{id}', pathParams: { id } });
    switch (result.status) {
        case 200:
            return mapSpotifyArtist(result.data);
        default:
            throw new SpotifyError({ operation: 'artist read', status: result.status });
    }
}
