import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { defineSpotify } from './defineSpotify.js';
import { defineSpotifyAuthCommand } from './defineSpotifyAuthCommand.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import type { SpotifyOptions } from './SpotifyOptions.js';

/** Options of {@link defineSpotifyCommands}. */
export interface SpotifyCommandsOptions extends SpotifyOptions {
    /** The command path prefix, space-separated. Default `spotify`. */
    prefix?: string;
}

/**
 * Defines the Spotify commands. Export them from a plugin module or spread them into a product CLI's
 * `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyCommands(options: SpotifyCommandsOptions): CommandClass[] {
    const params: SpotifyCommandParams = { prefix: options.prefix ?? 'spotify', spotify: defineSpotify(options) };
    return [defineSpotifyAuthCommand(params)];
}
