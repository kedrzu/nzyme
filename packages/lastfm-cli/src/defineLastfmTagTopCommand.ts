import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmTagGetTopAlbums } from './LastfmTagGetTopAlbums.js';
import { LastfmTagGetTopArtists } from './LastfmTagGetTopArtists.js';
import { LastfmTagGetTopTracks } from './LastfmTagGetTopTracks.js';
import { lastfmLimitOption, parseLastfmLimit } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> tag-top <tag> artists|albums|tracks [--limit]`: the artists, albums or tracks most
 * tagged with a tag, `rank  artist  [title]  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmTagTopCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmTagTopCommand extends Command {
        static override paths = [[...prefix.split(' '), 'tag-top']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: 'List the artists, albums or tracks most tagged with a tag',
            details: `
                Top first. Prints one tab-separated line per item: rank, artist, then for albums and
                tracks the title, and the MusicBrainz id last (empty when Last.fm has none). Last.fm
                gives no playcount here.
            `,
            examples: [
                ['Top shoegaze artists', `${prefix} tag-top shoegaze artists`],
                ['Top 80s tracks', `${prefix} tag-top 80s tracks --limit 50`],
            ],
        });

        tag = Option.String({ name: 'tag' });
        subject = Option.String({ name: 'artists|albums|tracks' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);
            const query = { tag: this.tag, limit };

            switch (this.subject) {
                case 'artists': {
                    const result = await lastfm(LastfmTagGetTopArtists, query);
                    if (!result) {
                        return this.notFound();
                    }

                    for (const item of result.items) {
                        this.context.stdout.write(formatTsvLine([item.rank, item.name, item.mbid ?? '']));
                    }

                    return 0;
                }
                case 'albums': {
                    const result = await lastfm(LastfmTagGetTopAlbums, query);
                    if (!result) {
                        return this.notFound();
                    }

                    for (const item of result.items) {
                        this.context.stdout.write(
                            formatTsvLine([item.rank, item.artist.name, item.name, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                case 'tracks': {
                    const result = await lastfm(LastfmTagGetTopTracks, query);
                    if (!result) {
                        return this.notFound();
                    }

                    for (const item of result.items) {
                        this.context.stdout.write(
                            formatTsvLine([item.rank, item.artist.name, item.name, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                default:
                    throw new UsageError(`Expected artists, albums or tracks, got ${this.subject}.`);
            }
        }

        private notFound() {
            this.context.stderr.write(`Not found: tag ${this.tag}\n`);
            return 1;
        }
    };
}
