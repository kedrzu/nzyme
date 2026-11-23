import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyPlaylist } from '../SpotifyTypes.js';
import { mapSpotifyPlaylist } from './spotifyMappers.js';

/** Params of {@link spotifyPlaylistCreate}. */
export interface SpotifyPlaylistCreateParams {
    name: string;
    description?: string;
    /** Whether the playlist shows on the profile. */
    public: boolean;
}

/** Creates an empty playlist for the account (`POST /me/playlists`). */
export async function spotifyPlaylistCreate(
    api: SpotifyApi,
    params: SpotifyPlaylistCreateParams,
): Promise<SpotifyPlaylist> {
    const result = await api({
        method: 'POST',
        path: '/me/playlists',
        contentType: 'application/json',
        body: { name: params.name, description: params.description, public: params.public },
    });
    switch (result.status) {
        case 201:
            return mapSpotifyPlaylist(result.data);
        default:
            throw new SpotifyError({ operation: 'playlist create', status: result.status });
    }
}
