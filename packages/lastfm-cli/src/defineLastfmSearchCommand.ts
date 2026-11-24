import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmAlbumSearch } from './LastfmAlbumSearch.js';
import { LastfmArtistSearch } from './LastfmArtistSearch.js';
import { LastfmTrackSearch } from './LastfmTrackSearch.js';
import { lastfmLimitOption, parseLastfmLimit } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> search artist|album|track <query> [--limit]`: artists, albums or tracks by name,
 * best match first, `artist  [title]  [listeners]  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmSearchCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmSearchCommand extends Command {
        static override paths = [[...prefix.split(' '), 'search']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: 'Search artists, albums or tracks by name',
            details: `
                Best match first; no match prints nothing. Prints one tab-separated line per match, the
                MusicBrainz id last (empty when Last.fm has none):
                - artist: name, listeners, mbid
                - album: artist, title, mbid
                - track: artist, title, listeners, mbid
            `,
            examples: [
                ['Artists named Cher', `${prefix} search artist Cher`],
                ['Tracks titled Believe', `${prefix} search track Believe --limit 5`],
            ],
        });

        subject = Option.String({ name: 'artist|album|track' });
        query = Option.String({ name: 'query' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);

            switch (this.subject) {
                case 'artist': {
                    const result = await lastfm(LastfmArtistSearch, { artist: this.query, limit });
                    for (const item of result.items) {
                        this.context.stdout.write(formatTsvLine([item.name, item.listeners, item.mbid ?? '']));
                    }

                    return 0;
                }
                case 'album': {
                    const result = await lastfm(LastfmAlbumSearch, { album: this.query, limit });
                    for (const item of result.items) {
                        this.context.stdout.write(formatTsvLine([item.artist.name, item.name, item.mbid ?? '']));
                    }

                    return 0;
                }
                case 'track': {
                    const result = await lastfm(LastfmTrackSearch, { track: this.query, limit });
                    for (const item of result.items) {
                        this.context.stdout.write(
                            formatTsvLine([item.artist.name, item.name, item.listeners, item.mbid ?? '']),
                        );
                    }

                    return 0;
                }
                default:
                    throw new UsageError(`Expected artist, album or track, got ${this.subject}.`);
            }
        }
    };
}
