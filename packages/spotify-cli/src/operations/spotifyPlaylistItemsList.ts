import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyEntry, SpotifyOffsetParams, SpotifyPage, SpotifyTrack } from '../SpotifyTypes.js';
import { mapSpotifyPage, mapSpotifyTrack } from './spotifyMappers.js';

/** Params of {@link spotifyPlaylistItemsList}. */
export interface SpotifyPlaylistItemsParams extends SpotifyOffsetParams {
    /** The playlist's id. */
    playlist: string;
}

/**
 * Lists the items of a playlist (`GET /playlists/{playlist_id}/items`), episodes mapped to tracks.
 * Spotify only serves them for the account's own and collaborative playlists: for any other, the answer
 * is `undefined`.
 */
export async function spotifyPlaylistItemsList(
    api: SpotifyApi,
    params: SpotifyPlaylistItemsParams,
): Promise<SpotifyPage<SpotifyEntry<SpotifyTrack>> | undefined> {
    const result = await api({
        method: 'GET',
        path: '/playlists/{playlist_id}/items',
        pathParams: { playlist_id: params.playlist },
        query: { limit: params.limit, offset: params.offset },
    });
    // The spec declares no 404, but Spotify answers it for a playlist the account cannot read.
    if (result.response.status === 404) {
        return undefined;
    }

    switch (result.status) {
        case 200:
            return mapSpotifyPage(result.data, playlistItem => {
                const raw = playlistItem.item ?? playlistItem.track;
                return raw ? { item: mapSpotifyTrack(raw), at: playlistItem.added_at ?? '' } : undefined;
            });
        case 403:
            return undefined;
        default:
            throw new SpotifyError({ operation: 'playlist items read', status: result.status });
    }
}
