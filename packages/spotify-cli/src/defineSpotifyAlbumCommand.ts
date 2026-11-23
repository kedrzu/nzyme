import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyAlbumRead } from './operations/spotifyAlbumRead.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyDuration } from './utils/formatSpotifyDuration.js';
import { parseSpotifyId } from './utils/parseSpotifyId.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> album <id>`: the album line, then one line per track,
 * `uri  trackNumber  name  artists  duration`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyAlbumCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyAlbumCommand extends Command {
        static override paths = [[...prefix.split(' '), 'album']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Show an album and its tracks',
            details: `
                The album as uri, name, artists and release date, then its tracks (the first 50) as uri,
                number, name, artists and duration. The album is an id, a \`spotify:album:<id>\` URI or an
                open.spotify.com link.
            `,
            examples: [['An album by id', `${prefix} album 4aawyAB9vmqN3uQ7FjRGTy`]],
        });

        album = Option.String({ name: 'album' });

        override async run() {
            const id = parseSpotifyId(this.album, 'album');
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const { album, tracks } = await spotifyAlbumRead(api, id);
            this.context.stdout.write(
                formatTsvLine([album.uri, album.name, album.artists.join(', '), album.releaseDate]),
            );
            for (const track of tracks) {
                this.context.stdout.write(
                    formatTsvLine([
                        track.uri,
                        track.trackNumber,
                        track.name,
                        track.artists.join(', '),
                        formatSpotifyDuration(track.durationMs),
                    ]),
                );
            }
        }
    };
}
