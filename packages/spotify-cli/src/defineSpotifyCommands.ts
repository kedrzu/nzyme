import { fileURLToPath } from 'node:url';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import type { OpenApiCommandsOptions } from '@nzyme/openapi-cli/defineOpenApiCommands.js';
import { defineOpenApiGetCommand } from '@nzyme/openapi-cli/OpenApiGetCommand.js';
import { defineOpenApiSchemaCommand } from '@nzyme/openapi-cli/OpenApiSchemaCommand.js';

import { defineSpotify } from './defineSpotify.js';
import { defineSpotifyAlbumCommand } from './defineSpotifyAlbumCommand.js';
import { defineSpotifyArtistCommand } from './defineSpotifyArtistCommand.js';
import { defineSpotifyAuthCommand } from './defineSpotifyAuthCommand.js';
import { defineSpotifyFollowingCommand } from './defineSpotifyFollowingCommand.js';
import { defineSpotifyMeCommand } from './defineSpotifyMeCommand.js';
import { defineSpotifyNowPlayingCommand } from './defineSpotifyNowPlayingCommand.js';
import { defineSpotifyPlaylistAddCommand } from './defineSpotifyPlaylistAddCommand.js';
import { defineSpotifyPlaylistCreateCommand } from './defineSpotifyPlaylistCreateCommand.js';
import { defineSpotifyPlaylistItemsCommand } from './defineSpotifyPlaylistItemsCommand.js';
import { defineSpotifyPlaylistListCommand } from './defineSpotifyPlaylistListCommand.js';
import { defineSpotifyQueueAddCommand } from './defineSpotifyQueueAddCommand.js';
import { defineSpotifyRecentCommand } from './defineSpotifyRecentCommand.js';
import { defineSpotifySavedCommand } from './defineSpotifySavedCommand.js';
import { defineSpotifySearchCommand } from './defineSpotifySearchCommand.js';
import { defineSpotifyTopCommand } from './defineSpotifyTopCommand.js';
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
    // The read-only escape hatch: `schema` and `get`, never the openapi-cli `write`. `get` signs in
    // through the same unit as the curated commands.
    const openApi: OpenApiCommandsOptions = {
        prefix: params.prefix,
        service: 'Spotify',
        baseUrl: 'https://api.spotify.com/v1',
        specPath: fileURLToPath(new URL('../openapi.json', import.meta.url)),
        authScheme: 'Bearer',
        securityScheme: 'oauth_2_0',
        credential: ({ container }) => container.resolve(params.spotify).getAccessToken(),
    };
    return [
        defineSpotifyAuthCommand(params),
        defineSpotifyAlbumCommand(params),
        defineSpotifyArtistCommand(params),
        defineSpotifyFollowingCommand(params),
        defineSpotifyMeCommand(params),
        defineSpotifyNowPlayingCommand(params),
        defineSpotifyPlaylistAddCommand(params),
        defineSpotifyPlaylistCreateCommand(params),
        defineSpotifyPlaylistItemsCommand(params),
        defineSpotifyPlaylistListCommand(params),
        defineSpotifyQueueAddCommand(params),
        defineSpotifyRecentCommand(params),
        defineSpotifySavedCommand(params),
        defineSpotifySearchCommand(params),
        defineSpotifyTopCommand(params),
        defineOpenApiSchemaCommand(openApi),
        defineOpenApiGetCommand(openApi),
    ];
}
