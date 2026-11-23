/**
 * The query of a Last.fm lookup: by MusicBrainz id as it is, by name with `autocorrect=1`, so a
 * misspelt or differently cased name resolves to the one Last.fm knows.
 */
import type { LastfmAlbumLookup, LastfmArtistLookup, LastfmTrackLookup } from '../LastfmTypes.js';

/** The part of a Last.fm query that names what is looked up. */
export type LastfmLookupQuery = Record<string, string | number>;

/**
 * The query of an artist lookup.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function artistLookupQuery(lookup: LastfmArtistLookup): LastfmLookupQuery {
    return 'mbid' in lookup ? { mbid: lookup.mbid } : { artist: lookup.artist, autocorrect: 1 };
}

/**
 * The query of an album lookup.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function albumLookupQuery(lookup: LastfmAlbumLookup): LastfmLookupQuery {
    return 'mbid' in lookup ? { mbid: lookup.mbid } : { artist: lookup.artist, album: lookup.album, autocorrect: 1 };
}

/**
 * The query of a track lookup.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function trackLookupQuery(lookup: LastfmTrackLookup): LastfmLookupQuery {
    return 'mbid' in lookup ? { mbid: lookup.mbid } : { artist: lookup.artist, track: lookup.track, autocorrect: 1 };
}
