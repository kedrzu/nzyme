import { defineService } from '@nzyme/ioc/Service.js';

/**
 * Where Spotify is reached. Every field unset (the default) means Spotify's real URLs; tests override
 * the service with a local fake.
 */
export interface SpotifyEndpoints {
    /** The accounts service root: `/authorize` and `/api/token` live under it. */
    accountsUrl?: string;
    /** The Web API root, with its version (`https://api.spotify.com/v1`). */
    apiUrl?: string;
}

/** The Spotify URLs in use; `{}` (Spotify's own) unless a test sets it. */
export const SpotifyEndpoints = defineService<SpotifyEndpoints>({
    name: 'SpotifyEndpoints',
    setup: () => ({}),
});
