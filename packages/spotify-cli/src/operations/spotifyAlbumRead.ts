import type { SpotifyApi } from '../createSpotifyApi.js';
import type { components } from '../schema.gen.js';
import { SpotifyError } from '../SpotifyError.js';
import type { SpotifyAlbum, SpotifyTrack } from '../SpotifyTypes.js';
import { mapSpotifyAlbum } from './spotifyMappers.js';

/** An album with its tracks. */
export interface SpotifyAlbumDetail {
    album: SpotifyAlbum;
    /** The tracks Spotify embeds in the album, the first 50 at most. */
    tracks: SpotifyTrack[];
}

/** Reads one album and its tracks by the album's id (`GET /albums/{id}`). */
export async function spotifyAlbumRead(api: SpotifyApi, id: string): Promise<SpotifyAlbumDetail> {
    const result = await api({ method: 'GET', path: '/albums/{id}', pathParams: { id } });
    switch (result.status) {
        case 200: {
            const album = mapSpotifyAlbum(result.data);
            const tracks = (result.data.tracks.items ?? []).map(track => mapAlbumTrack(track, album.name));
            return { album, tracks };
        }
        default:
            throw new SpotifyError({ operation: 'album read', status: result.status });
    }
}

/** A track of an album listing carries no album of its own: the album's name is the one. */
function mapAlbumTrack(raw: components['schemas']['SimplifiedTrackObject'], album: string): SpotifyTrack {
    return {
        uri: raw.uri ?? '',
        name: raw.name ?? '',
        artists: raw.artists?.map(artist => artist.name ?? '') ?? [],
        album,
        durationMs: raw.duration_ms ?? 0,
        trackNumber: raw.track_number ?? 0,
    };
}
