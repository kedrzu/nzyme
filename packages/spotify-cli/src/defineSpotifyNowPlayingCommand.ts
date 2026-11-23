import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyNowPlayingRead } from './operations/spotifyNowPlayingRead.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyDuration } from './utils/formatSpotifyDuration.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> now-playing`: `uri  name  artists  progress/duration  playing|paused`, or
 * `Nothing is playing.`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyNowPlayingCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyNowPlayingCommand extends Command {
        static override paths = [[...prefix.split(' '), 'now-playing']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Show what is playing now',
            details: `
                One tab-separated line: uri, name, artists, progress and duration (m:ss) and playing or
                paused. Prints "Nothing is playing." when no player is active.
            `,
            examples: [['What plays now', `${prefix} now-playing`]],
        });

        override async run() {
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const playback = await spotifyNowPlayingRead(api);
            if (!playback) {
                this.context.stdout.write('Nothing is playing.\n');
                return;
            }

            const { track } = playback;
            this.context.stdout.write(
                formatTsvLine([
                    track.uri,
                    track.name,
                    track.artists.join(', '),
                    `${formatSpotifyDuration(playback.progressMs)}/${formatSpotifyDuration(track.durationMs)}`,
                    playback.isPlaying ? 'playing' : 'paused',
                ]),
            );
        }
    };
}
