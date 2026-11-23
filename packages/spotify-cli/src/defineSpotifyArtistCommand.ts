import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyArtistAlbumsList } from './operations/spotifyArtistAlbumsList.js';
import { spotifyArtistRead } from './operations/spotifyArtistRead.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyArtistLine } from './utils/formatSpotifyArtistLine.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyId } from './utils/parseSpotifyId.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> artist <id>`: the artist line, then one line per album,
 * `uri  name  releaseDate  albumType`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyArtistCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyArtistCommand extends Command {
        static override paths = [[...prefix.split(' '), 'artist']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Show an artist and its albums',
            details: `
                The artist as uri, name and genres (often empty), then its albums, 10 at a time, as uri,
                name, release date and type. The artist is an id, a \`spotify:artist:<id>\` URI or an
                open.spotify.com link.
            `,
            examples: [
                ['An artist by link', `${prefix} artist https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb`],
            ],
        });

        artist = Option.String({ name: 'artist' });
        offset = Option.String('--offset', '0', { description: 'How many albums to skip' });

        override async run() {
            const id = parseSpotifyId(this.artist, 'artist');
            const offset = parseSpotifyOffset(this.offset);
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const [artist, albums] = await Promise.all([
                spotifyArtistRead(api, id),
                spotifyArtistAlbumsList(api, { id, limit: 10, offset }),
            ]);
            this.context.stdout.write(formatSpotifyArtistLine(artist));
            for (const album of albums.items) {
                this.context.stdout.write(formatTsvLine([album.uri, album.name, album.releaseDate, album.albumType]));
            }

            if (albums.nextOffset !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--offset', albums.nextOffset));
            }
        }
    };
}
