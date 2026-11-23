import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { spotifyQueueAdd } from './operations/spotifyQueueAdd.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { parseSpotifyPlayableUri } from './utils/parseSpotifyPlayableUri.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> queue add <uri>`: puts a track or episode on the playback queue.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyQueueAddCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyQueueAddCommand extends Command {
        static override paths = [[...prefix.split(' '), 'queue', 'add']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Add a track or episode to the playback queue',
            details: `
                Queues a track or episode, given as a \`spotify:track:<id>\` or \`spotify:episode:<id>\`
                URI or an open.spotify.com link. It only adds, and needs Spotify Premium and playback
                running on a device.
            `,
            examples: [['Queue a track', `${prefix} queue add spotify:track:4iV5W9uYEdYUVa79Axb7Rh`]],
        });

        uri = Option.String({ name: 'uri' });

        override async run() {
            const uri = parseSpotifyPlayableUri(this.uri);
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            if (!(await spotifyQueueAdd(api, { uri }))) {
                throw new UsageError('Nothing is playing on any device: start playback in a Spotify app, then retry.');
            }

            this.context.stdout.write(`Queued ${uri}.\n`);
        }
    };
}
