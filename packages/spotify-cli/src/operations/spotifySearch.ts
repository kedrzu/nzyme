import type { SpotifyApi } from '../createSpotifyApi.js';
import { SpotifyError } from '../SpotifyError.js';
import type {
    SpotifyAlbum,
    SpotifyArtist,
    SpotifyOffsetParams,
    SpotifyPage,
    SpotifyPlaylist,
    SpotifyTrack,
} from '../SpotifyTypes.js';
import {
    mapSpotifyAlbum,
    mapSpotifyArtist,
    mapSpotifyPage,
    mapSpotifyPlaylist,
    mapSpotifyTrack,
} from './spotifyMappers.js';

/** What a search can look for. */
export type SpotifySearchType = 'artist' | 'track' | 'album' | 'playlist';

/** Params of {@link spotifySearch}. */
export interface SpotifySearchParams extends SpotifyOffsetParams {
    query: string;
    /** Default artist, track and album. */
    types?: SpotifySearchType[];
}

/** The pages of a search, one per asked type. */
export interface SpotifySearchResults {
    artists: SpotifyPage<SpotifyArtist> | undefined;
    tracks: SpotifyPage<SpotifyTrack> | undefined;
    albums: SpotifyPage<SpotifyAlbum> | undefined;
    playlists: SpotifyPage<SpotifyPlaylist> | undefined;
}

/** Searches the catalogue (`GET /search`); the limit is at most 10 per type. */
export async function spotifySearch(api: SpotifyApi, params: SpotifySearchParams): Promise<SpotifySearchResults> {
    const { query, limit, offset } = params;
    const types = params.types ?? ['artist', 'track', 'album'];
    const result = await api({
        method: 'GET',
        path: '/search',
        query: {
            q: query,
            // Spec bug: `type` is typed as an array, which serialises as repeated `type=` parameters, but
            // Spotify documents only one comma-separated value. Sent as a one-element array holding it.
            type: [types.join(',') as SpotifySearchType],
            limit,
            offset,
        },
    });
    switch (result.status) {
        case 200: {
            const { artists, tracks, albums, playlists } = result.data;
            return {
                artists: artists && mapSpotifyPage(artists, mapSpotifyArtist),
                tracks: tracks && mapSpotifyPage(tracks, mapSpotifyTrack),
                albums: albums && mapSpotifyPage(albums, mapSpotifyAlbum),
                playlists: playlists && mapSpotifyPage(playlists, mapSpotifyPlaylist),
            };
        }
        default:
            throw new SpotifyError({ operation: 'search', status: result.status });
    }
}
