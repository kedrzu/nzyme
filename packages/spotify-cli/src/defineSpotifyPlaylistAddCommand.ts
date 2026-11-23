import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { SPOTIFY_ADD_LIMIT, spotifyPlaylistItemsAdd } from './operations/spotifyPlaylistItemsAdd.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { parseSpotifyId } from './utils/parseSpotifyId.js';
import { parseSpotifyPlayableUri } from './utils/parseSpotifyPlayableUri.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> playlist add <playlist> <uri...>`: appends tracks and episodes to a playlist.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyPlaylistAddCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyPlaylistAddCommand extends Command {
        static override paths = [[...prefix.split(' '), 'playlist', 'add']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Add tracks or episodes to a playlist',
            details: `
                Appends up to ${SPOTIFY_ADD_LIMIT} tracks or episodes, given as \`spotify:track:<id>\`
                or \`spotify:episode:<id>\` URIs or open.spotify.com links, to the end of one of the
                account's own or a collaborative playlist. It only adds: nothing is removed or reordered.
            `,
            examples: [
                ['Add a track', `${prefix} playlist add 37i9dQZF1DXcBWIGoYBM5M spotify:track:4iV5W9uYEdYUVa79Axb7Rh`],
            ],
        });

        playlist = Option.String({ name: 'playlist' });
        uris = Option.Rest({ name: 'uri', required: 1 });

        override async run() {
            const playlist = parseSpotifyId(this.playlist, 'playlist');
            if (this.uris.length > SPOTIFY_ADD_LIMIT) {
                throw new UsageError(
                    `Spotify takes at most ${SPOTIFY_ADD_LIMIT} items per add, got ${this.uris.length}.`,
                );
            }

            const uris = this.uris.map(parseSpotifyPlayableUri);
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            if (!(await spotifyPlaylistItemsAdd(api, { playlist, uris }))) {
                throw new UsageError(
                    'Spotify only lets you add to your own and collaborative playlists, and this is neither.',
                );
            }

            this.context.stdout.write(`Added ${uris.length} items to spotify:playlist:${playlist}.\n`);
        }
    };
}
