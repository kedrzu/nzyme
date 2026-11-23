import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmChartGetTopArtists } from './LastfmChartGetTopArtists.js';
import { LastfmChartGetTopTags } from './LastfmChartGetTopTags.js';
import { LastfmChartGetTopTracks } from './LastfmChartGetTopTracks.js';
import { lastfmLimitOption, parseLastfmLimit } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> chart artists|tracks|tags [--limit]`: Last.fm's global charts,
 * `rank  name(s)  stat  [mbid]`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmChartCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmChartCommand extends Command {
        static override paths = [[...prefix.split(' '), 'chart']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "List Last.fm's global top artists, tracks or tags",
            details: `
                Top first. Prints one tab-separated line per item, MusicBrainz ids last (empty when
                Last.fm has none):
                - artists: rank, name, playcount, mbid
                - tracks: rank, artist, title, playcount, mbid
                - tags: rank, name, reach (how many users applied it); tags have no mbid
            `,
            examples: [
                ["This week's top artists", `${prefix} chart artists`],
                ['The 50 most used tags', `${prefix} chart tags --limit 50`],
            ],
        });

        subject = Option.String({ name: 'artists|tracks|tags' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);

            // Last.fm ranks nothing here; each chart is top first, so the position is the rank.
            switch (this.subject) {
                case 'artists': {
                    const result = await lastfm(LastfmChartGetTopArtists, { limit });
                    for (const [index, item] of result.items.entries()) {
                        this.context.stdout.write(
                            formatTsvLine([index + 1, item.name, item.playcount, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                case 'tracks': {
                    const result = await lastfm(LastfmChartGetTopTracks, { limit });
                    for (const [index, item] of result.items.entries()) {
                        this.context.stdout.write(
                            formatTsvLine([index + 1, item.artist.name, item.name, item.playcount, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                case 'tags': {
                    const result = await lastfm(LastfmChartGetTopTags, { limit });
                    for (const [index, item] of result.items.entries()) {
                        this.context.stdout.write(formatTsvLine([index + 1, item.name, item.reach]));
                    }

                    return 0;
                }
                default:
                    throw new UsageError(`Expected artists, tracks or tags, got ${this.subject}.`);
            }
        }
    };
}
