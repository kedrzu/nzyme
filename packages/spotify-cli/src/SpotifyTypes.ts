/** An artist. `genres` is often empty: Spotify no longer fills `popularity` and `followers` for new apps, so they are not modelled. */
export interface SpotifyArtist {
    uri: string;
    name: string;
    genres: string[];
}

/** A track; an episode of a playlist is mapped to it too, without artists and album. */
export interface SpotifyTrack {
    uri: string;
    name: string;
    /** Artist names, in Spotify's order. */
    artists: string[];
    /** The album's name; empty where the answer carries none. */
    album: string;
    durationMs: number;
    /** The number on its disc, 0 where the answer carries none. */
    trackNumber: number;
}

/** An album, as listed. */
export interface SpotifyAlbum {
    uri: string;
    name: string;
    artists: string[];
    /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, as Spotify has it. */
    releaseDate: string;
    /** `album`, `single` or `compilation`. */
    albumType: string;
}

/** A playlist, as listed. */
export interface SpotifyPlaylist {
    uri: string;
    name: string;
    ownerId: string;
    /** The number of items; undefined where the answer carries no count. */
    total: number | undefined;
    /** Undefined for a playlist whose visibility Spotify does not tell. */
    public: boolean | undefined;
}

/** A listed item with the moment it was saved, added to a playlist or played. */
export interface SpotifyEntry<T> {
    item: T;
    /** ISO timestamp. */
    at: string;
}

/** A page of an offset-paged list. */
export interface SpotifyPage<T> {
    items: T[];
    /** How many items the whole list has. */
    total: number;
    offset: number;
    /** The `offset` of the next page; undefined on the last one. */
    nextOffset: number | undefined;
}

/** A page of a cursor-paged list. */
export interface SpotifyCursorPage<T> {
    items: T[];
    /** The cursor of the next page; undefined on the last one. */
    cursor: string | undefined;
}

/** The signed-in account's profile. */
export interface SpotifyProfile {
    id: string;
    /** Undefined for an account without one. */
    displayName: string | undefined;
}

/** What plays now. */
export interface SpotifyPlayback {
    track: SpotifyTrack;
    progressMs: number;
    isPlaying: boolean;
}

/** The window of a top list: about 4 weeks (`short`), 6 months (`medium`) or a year (`long`) of listening. */
export type SpotifyTimeRange = 'short' | 'medium' | 'long';

/** Paging of an offset-paged list. */
export interface SpotifyOffsetParams {
    /** The most items to return; the endpoint's own cap applies (50, search and artist albums 10). */
    limit?: number;
    offset?: number;
}

/** Params of the top lists. */
export interface SpotifyTopListParams extends SpotifyOffsetParams {
    /** Default `medium`. */
    range?: SpotifyTimeRange;
}
