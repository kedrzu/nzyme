/**
 * Every scope `auth` requests, and no other: reading the taste profile, the library and the playlists,
 * building private and public playlists, and adding to the queue. Nothing that removes (saving to the
 * library and playback control are left out too). A sign-in missing any of them is refused.
 */
export const SPOTIFY_SCOPES = [
    'user-top-read',
    'user-read-recently-played',
    'user-library-read',
    'user-follow-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-modify-playback-state',
    'user-read-currently-playing',
] as const;
