import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { SpotifyShape } from './defineSpotify.js';

/** What every Spotify command is defined with. */
export interface SpotifyCommandParams {
    /** The command path prefix, space-separated (`spotify`): the sign-in command is `<prefix> auth`. */
    prefix: string;
    /** The set's unit from `defineSpotify`, created once per command set. */
    spotify: Injectable<SpotifyShape>;
}
