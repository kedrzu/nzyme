import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';

/** The most items Spotify takes in one add. */
export const SPOTIFY_ADD_LIMIT = 100;

/** Params of {@link spotifyPlaylistItemsAdd}. */
export interface SpotifyPlaylistItemsAddParams {
    /** The playlist's id. */
    playlist: string;
    /** Track and episode URIs, at most {@link SPOTIFY_ADD_LIMIT}. */
    uris: string[];
}

/**
 * Appends items to a playlist (`POST /playlists/{playlist_id}/items`). Spotify only allows it for the
 * account's own and collaborative playlists: for any other, the answer is `false`.
 */
export async function spotifyPlaylistItemsAdd(
    api: SpotifyApi,
    params: SpotifyPlaylistItemsAddParams,
): Promise<boolean> {
    const result = await api({
        method: 'POST',
        path: '/playlists/{playlist_id}/items',
        contentType: 'application/json',
        pathParams: { playlist_id: params.playlist },
        body: { uris: params.uris },
    });
    // The spec declares no 404, but Spotify answers it for a playlist that does not exist or is not visible.
    if (result.response.status === 404) {
        return false;
    }

    switch (result.status) {
        case 201:
            return true;
        case 403:
            return false;
        default:
            throw new SpotifyError({ operation: 'playlist add', status: result.status });
    }
}
