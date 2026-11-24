/**
 * Small types shared by the Last.fm endpoints. Every `mbid` is a MusicBrainz id, `null` when Last.fm
 * has none; every `url` is the Last.fm page, `null` when Last.fm sent none.
 */

/** An artist as an item or a list entry refers to it. */
export interface LastfmArtistRef {
    name: string;
    /** `null` also where Last.fm gives only the artist's name (search results, `album.getInfo`). */
    mbid: string | null;
    /** `null` also where Last.fm gives only the artist's name. */
    url: string | null;
}

/** A track or an album in a list: its name and ids, and its artist. */
export interface LastfmItemRef {
    name: string;
    mbid: string | null;
    url: string | null;
    artist: LastfmArtistRef;
}

/** One of a user's top tracks or albums. */
export interface LastfmUserTopItem extends LastfmItemRef {
    /** The 1-based position across all pages. */
    rank: number;
    /** The user's plays in the period. */
    playcount: number;
}

/** A tag (a genre, a mood, a decade) as Last.fm's users apply it. */
export interface LastfmTagRef {
    name: string;
    url: string | null;
}

/** The time range of a user's top lists. */
export type LastfmPeriod = 'overall' | '7day' | '1month' | '3month' | '6month' | '12month';

/**
 * An artist looked up by name, which Last.fm autocorrects (the result carries the name it resolved
 * to), or by MusicBrainz id.
 */
export type LastfmArtistLookup = { artist: string } | { mbid: string };

/** An album looked up by artist and title, which Last.fm autocorrects, or by MusicBrainz id. */
export type LastfmAlbumLookup = { artist: string; album: string } | { mbid: string };

/** A track looked up by artist and title, which Last.fm autocorrects, or by MusicBrainz id. */
export type LastfmTrackLookup = { artist: string; track: string } | { mbid: string };

/** Paging of a list method; Last.fm's defaults (usually 50 per page, page 1) when omitted. */
export interface LastfmPaging {
    /** Items per page. */
    limit?: number;
    /** The 1-based page. */
    page?: number;
}
