import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmTrackGetSimilar } from './LastfmTrackGetSimilar.js';
import { lastfmLimitOption, parseLastfmLimit, writeResolvedName } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> similar-tracks <artist> <track> [--limit]`: tracks similar to one track, most
 * similar first, `artist  track  match  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmSimilarTracksCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmSimilarTracksCommand extends Command {
        static override paths = [[...prefix.split(' '), 'similar-tracks']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: 'List tracks similar to a track',
            details: `
                Most similar first. Prints one tab-separated line per track: artist, title, similarity
                (0 to 1, two decimals) and the track's MusicBrainz id (empty when Last.fm has none).
                Last.fm autocorrects the names; when the artist resolves to another name, \`# <name>\`
                goes to stderr.
            `,
            examples: [['Tracks like Believe', `${prefix} similar-tracks Cher Believe`]],
        });

        artist = Option.String({ name: 'artist' });
        track = Option.String({ name: 'track' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);

            const result = await lastfm(LastfmTrackGetSimilar, { artist: this.artist, track: this.track, limit });
            if (!result) {
                this.context.stderr.write(`Not found: track ${this.artist} - ${this.track}\n`);
                return 1;
            }

            writeResolvedName(this.context.stderr, this.artist, result.artist);
            for (const item of result.items) {
                this.context.stdout.write(
                    formatTsvLine([item.artist.name, item.name, item.match.toFixed(2), item.mbid ?? '']),
                );
            }

            return 0;
        }
    };
}
