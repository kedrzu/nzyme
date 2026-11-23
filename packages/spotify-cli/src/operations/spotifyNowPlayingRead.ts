import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyPlayback } from '../SpotifyTypes.js';
import { mapSpotifyTrack } from './spotifyMappers.js';

/** Reads what plays now (`GET /me/player/currently-playing`); `undefined` when nothing does. */
export async function spotifyNowPlayingRead(api: SpotifyApi): Promise<SpotifyPlayback | undefined> {
    const result = await api({ method: 'GET', path: '/me/player/currently-playing' });
    // The spec declares no 204, which is Spotify's answer while nothing plays.
    if (result.response.status === 204) {
        return undefined;
    }

    switch (result.status) {
        case 200: {
            const { item } = result.data;
            return item
                ? {
                      track: mapSpotifyTrack(item),
                      progressMs: result.data.progress_ms ?? 0,
                      isPlaying: result.data.is_playing ?? false,
                  }
                : undefined;
        }
        default:
            throw new SpotifyError({ operation: 'now playing read', status: result.status });
    }
}
