import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyTopArtistsList } from './operations/spotifyTopArtistsList.js';
import { spotifyTopTracksList } from './operations/spotifyTopTracksList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyArtistLine } from './utils/formatSpotifyArtistLine.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

const RANGES = ['short', 'medium', 'long'] as const;

/**
 * Defines `<prefix> top <artists|tracks>`: the account's most listened-to artists
 * (`uri  name  genres`) or tracks (`uri  name  artists  album`).
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyTopCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyTopCommand extends Command {
        static override paths = [[...prefix.split(' '), 'top']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'List the most listened-to artists or tracks',
            details: `
                One tab-separated line per item: artists as uri, name and genres (often empty), tracks as
                uri, name, artists and album. \`--range\` picks the window: short (about 4 weeks), medium
                (6 months, the default) or long (a year). \`--limit\` is at most 50.
            `,
            examples: [['Top tracks of the last 4 weeks', `${prefix} top tracks --range short`]],
        });

        kind = Option.String({ name: 'artists|tracks' });
        range = Option.String('--range', 'medium', { description: 'short, medium or long' });
        limit = Option.String('--limit', '20', { description: 'The most items to list, up to 50' });
        offset = Option.String('--offset', '0', { description: 'How many items to skip' });

        override async run() {
            const { kind } = this;
            if (kind !== 'artists' && kind !== 'tracks') {
                throw new UsageError(`Pass artists or tracks, got ${kind}.`);
            }

            const range = RANGES.find(candidate => candidate === this.range);
            if (!range) {
                throw new UsageError(`--range must be one of ${RANGES.join(', ')}, got ${this.range}.`);
            }

            const query = {
                range,
                limit: parseSpotifyLimit({ value: this.limit, max: 50 }),
                offset: parseSpotifyOffset(this.offset),
            };
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            if (kind === 'artists') {
                const page = await spotifyTopArtistsList(api, query);
                for (const artist of page.items) {
                    this.context.stdout.write(formatSpotifyArtistLine(artist));
                }

                this.hint(page.nextOffset);
                return;
            }

            const page = await spotifyTopTracksList(api, query);
            for (const track of page.items) {
                this.context.stdout.write(
                    formatTsvLine([track.uri, track.name, track.artists.join(', '), track.album]),
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
