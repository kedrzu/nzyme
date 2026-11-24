import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import type { LastfmPeriod, LastfmUserTopItem } from './LastfmTypes.js';
import { LastfmUserGetTopAlbums } from './LastfmUserGetTopAlbums.js';
import { LastfmUserGetTopArtists } from './LastfmUserGetTopArtists.js';
import { LastfmUserGetTopTracks } from './LastfmUserGetTopTracks.js';
import { lastfmLimitOption, parseLastfmLimit } from './utils/lastfmCommandHelpers.js';

const PERIODS = 'overall, 7day, 1month, 3month, 6month or 12month';

/**
 * Defines `<prefix> user-top <user> artists|albums|tracks [--period] [--limit]`: a user's most played
 * artists, albums or tracks, `rank  artist  [title]  playcount  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmUserTopCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmUserTopCommand extends Command {
        static override paths = [[...prefix.split(' '), 'user-top']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "List a user's most played artists, albums or tracks",
            details: `
                Most played in \`--period\` first: ${PERIODS} (default overall). Prints one
                tab-separated line per item: rank, artist, then for albums and tracks the title, the
                user's playcount in the period, and the MusicBrainz id last (empty when Last.fm has
                none).
            `,
            examples: [
                ["rj's top artists of all time", `${prefix} user-top rj artists`],
                ["rj's top tracks of the last month", `${prefix} user-top rj tracks --period 1month`],
            ],
        });

        user = Option.String({ name: 'user' });
        subject = Option.String({ name: 'artists|albums|tracks' });
        period = Option.String('--period', 'overall', { description: `The time range: ${PERIODS}` });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const period = parsePeriod(this.period);
            const lastfm = this.container.resolve(params.client);
            const query = { user: this.user, period, limit };

            switch (this.subject) {
                case 'artists': {
                    const result = await lastfm(LastfmUserGetTopArtists, query);
                    if (!result) {
                        return this.notFound();
                    }

                    for (const item of result.items) {
                        this.context.stdout.write(
                            formatTsvLine([item.rank, item.name, item.playcount, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                case 'albums': {
                    const result = await lastfm(LastfmUserGetTopAlbums, query);
                    if (!result) {
                        return this.notFound();
                    }

                    this.writeItems(result.items);
                    return 0;
                }
                case 'tracks': {
                    const result = await lastfm(LastfmUserGetTopTracks, query);
                    if (!result) {
                        return this.notFound();
                    }

                    this.writeItems(result.items);
                    return 0;
                }
                default:
                    throw new UsageError(`Expected artists, albums or tracks, got ${this.subject}.`);
            }
        }

        private writeItems(items: LastfmUserTopItem[]) {
            for (const item of items) {
                this.context.stdout.write(
                    formatTsvLine([item.rank, item.artist.name, item.name, item.playcount, item.mbid ?? '']),
                );
            }
        }

        private notFound() {
            this.context.stderr.write(`Not found: user ${this.user}\n`);
            return 1;
        }
    };
}

function parsePeriod(value: string): LastfmPeriod {
    switch (value) {
        case 'overall':
        case '7day':
        case '1month':
        case '3month':
        case '6month':
        case '12month':
            return value;
        default:
            throw new UsageError(`--period must be ${PERIODS}, got ${value}.`);
    }
}
