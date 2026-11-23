import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyPlaylistCreate } from './operations/spotifyPlaylistCreate.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> playlist create <name>`: a new empty playlist, printed as `playlist list` does.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyPlaylistCreateCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyPlaylistCreateCommand extends Command {
        static override paths = [[...prefix.split(' '), 'playlist', 'create']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Create an empty playlist',
            details: `
                Creates a new, empty playlist for the account, private unless \`--public\`, and prints it
                like \`playlist list\`: uri, name, owner id, item count and public or private. It only
                adds: nothing existing is changed or removed.
            `,
            examples: [['A private playlist', `${prefix} playlist create "Evening" --description "Slow songs"`]],
        });

        name = Option.String({ name: 'name' });
        description = Option.String('--description', { description: 'The playlist description' });
        public = Option.Boolean('--public', false, { description: 'Show the playlist on the profile' });

        override async run() {
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const playlist = await spotifyPlaylistCreate(api, {
                name: this.name,
                description: this.description,
                public: this.public,
            });

            const visibility = playlist.public === undefined ? '' : playlist.public ? 'public' : 'private';
            this.context.stdout.write(
                formatTsvLine([playlist.uri, playlist.name, playlist.ownerId, playlist.total ?? '', visibility]),
            );
        }
    };
}
