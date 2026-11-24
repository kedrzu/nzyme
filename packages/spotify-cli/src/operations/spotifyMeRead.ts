import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyProfile } from '../SpotifyTypes.js';

/** Reads the signed-in account's profile (`GET /me`). */
export async function spotifyMeRead(api: SpotifyApi): Promise<SpotifyProfile> {
    const result = await api({ method: 'GET', path: '/me' });
    switch (result.status) {
        case 200:
            return { id: result.data.id ?? '', displayName: result.data.display_name };
        default:
            throw new SpotifyError({ operation: 'profile read', status: result.status });
    }
}
