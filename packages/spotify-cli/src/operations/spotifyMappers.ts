import type { components } from '../schema.gen.js';
import type { SpotifyAlbum, SpotifyArtist, SpotifyPage, SpotifyPlaylist, SpotifyTrack } from '../SpotifyTypes.js';

type Schemas = components['schemas'];

/** Maps a full or simplified artist. Never reads `popularity` or `followers`. */
export function mapSpotifyArtist(raw: Schemas['ArtistObject']): SpotifyArtist {
    return { uri: raw.uri ?? '', name: raw.name ?? '', genres: raw.genres ?? [] };
}

/**
 * Maps a track. A playlist item may be an episode: the spec's `EpisodeObject` is an impossible type
 * (its `type` literal contradicts its own base's), so it reads as a track here and an episode ends up
 * with no artists and no album.
 */
export function mapSpotifyTrack(raw: Schemas['TrackObject']): SpotifyTrack {
    return {
        uri: raw.uri ?? '',
        name: raw.name ?? '',
        artists: raw.artists?.map(artist => artist.name ?? '') ?? [],
        album: raw.album?.name ?? '',
        durationMs: raw.duration_ms ?? 0,
        trackNumber: raw.track_number ?? 0,
    };
}

/** Maps an album of a library, a search or a discography. */
export function mapSpotifyAlbum(raw: Schemas['SimplifiedAlbumObject']): SpotifyAlbum {
    return {
        uri: raw.uri,
        name: raw.name,
        artists: raw.artists.map(artist => artist.name ?? ''),
        releaseDate: raw.release_date,
        albumType: raw.album_type,
    };
}

/** Maps a playlist. The item count is `items.total` since Spotify renamed `tracks` in February 2026; either is read. */
export function mapSpotifyPlaylist(
    raw: Pick<Schemas['SimplifiedPlaylistObject'], 'uri' | 'name' | 'owner' | 'items' | 'tracks' | 'public'>,
): SpotifyPlaylist {
    return {
        uri: raw.uri ?? '',
        name: raw.name ?? '',
        ownerId: raw.owner?.id ?? '',
        total: raw.items?.total ?? raw.tracks?.total,
        public: raw.public,
    };
}

/** Maps an offset-paged answer, dropping the `null` items Spotify leaves in some lists and those `map` returns undefined for. */
export function mapSpotifyPage<Raw, T>(
    page: { items?: (Raw | null)[]; total: number; offset: number; next: string | null },
    map: (raw: Raw) => T | undefined,
): SpotifyPage<T> {
    const raws = page.items ?? [];
    const items: T[] = [];
    for (const raw of raws) {
        const mapped = raw == null ? undefined : map(raw);
        if (mapped !== undefined) {
            items.push(mapped);
        }
    }

    return {
        items,
        total: page.total,
        offset: page.offset,
        nextOffset: page.next == null ? undefined : page.offset + raws.length,
    };
}
