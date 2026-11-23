import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';

/**
 * Adds a track or episode to the playback queue (`POST /me/player/queue`). With no active device,
 * nothing is queued and the answer is `false`.
 */
export async function spotifyQueueAdd(api: SpotifyApi, params: { uri: string }): Promise<boolean> {
    const result = await api({ method: 'POST', path: '/me/player/queue', query: { uri: params.uri } });
    // The spec declares no 404, but Spotify answers it (`NO_ACTIVE_DEVICE`) when nothing plays on any device.
    if (result.response.status === 404) {
        return false;
    }

    switch (result.status) {
        case 204:
            return true;
        default:
            throw new SpotifyError({ operation: 'queue add', status: result.status });
    }
}
