import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifySavedAlbumsList } from './operations/spotifySavedAlbumsList.js';
import { spotifySavedTracksList } from './operations/spotifySavedTracksList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> saved <tracks|albums>`: the library, newest saved first. Tracks print
 * `uri  name  artists  album  addedAt`, albums `uri  name  artists  releaseDate  addedAt`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifySavedCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifySavedCommand extends Command {
        static override paths = [[...prefix.split(' '), 'saved']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'List the saved tracks or albums, newest first',
            details: `
                One tab-separated line per item: tracks as uri, name, artists, album and when it was
                saved; albums as uri, name, artists, release date and when it was saved. \`--limit\` is at
                most 50.
            `,
            examples: [['The 30 latest saved tracks', `${prefix} saved tracks --limit 30`]],
        });

        kind = Option.String({ name: 'tracks|albums' });
        limit = Option.String('--limit', '20', { description: 'The most items to list, up to 50' });
        offset = Option.String('--offset', '0', { description: 'How many items to skip' });

        override async run() {
            const { kind } = this;
            if (kind !== 'tracks' && kind !== 'albums') {
                throw new UsageError(`Pass tracks or albums, got ${kind}.`);
            }

            const query = {
                limit: parseSpotifyLimit({ value: this.limit, max: 50 }),
                offset: parseSpotifyOffset(this.offset),
            };
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            if (kind === 'tracks') {
                const page = await spotifySavedTracksList(api, query);
                for (const { item, at } of page.items) {
                    this.context.stdout.write(
                        formatTsvLine([item.uri, item.name, item.artists.join(', '), item.album, at]),
                    );
                }

                this.hint(page.nextOffset);
                return;
            }

            const page = await spotifySavedAlbumsList(api, query);
            for (const { item, at } of page.items) {
                this.context.stdout.write(
                    formatTsvLine([item.uri, item.name, item.artists.join(', '), item.releaseDate, at]),
                );
            }

            this.hint(page.nextOffset);
        }

        private hint(nextOffset: number | undefined) {
            if (nextOffset !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--offset', nextOffset));
            }
        }
    };
}
