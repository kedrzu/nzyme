import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyArtist, SpotifyCursorPage } from '../SpotifyTypes.js';
import { mapSpotifyArtist } from './spotifyMappers.js';

/** Params of {@link spotifyFollowedArtistsList}. */
export interface SpotifyFollowedArtistsParams {
    /** At most 50. */
    limit?: number;
    /** The cursor of an earlier answer: lists the artists after it. */
    after?: string;
}

/** Lists the artists the account follows (`GET /me/following`). */
export async function spotifyFollowedArtistsList(
    api: SpotifyApi,
    params: SpotifyFollowedArtistsParams = {},
): Promise<SpotifyCursorPage<SpotifyArtist>> {
    const result = await api({
        method: 'GET',
        path: '/me/following',
        query: { type: 'artist', limit: params.limit, after: params.after },
    });
    switch (result.status) {
        case 200: {
            const { artists } = result.data;
            return {
                items: (artists.items ?? []).map(mapSpotifyArtist),
                cursor: artists.next ? artists.cursors?.after : undefined,
            };
        }
        default:
            throw new SpotifyError({ operation: 'followed artists read', status: result.status });
    }
}
