import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmArtistGetSimilar } from './LastfmArtistGetSimilar.js';
import { lastfmLimitOption, parseLastfmLimit, writeResolvedName } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> similar-artists <artist> [--limit]`: artists similar to one artist, most similar
 * first, `artist  match  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmSimilarArtistsCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmSimilarArtistsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'similar-artists']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: 'List artists similar to an artist',
            details: `
                Most similar first. Prints one tab-separated line per artist: name, similarity (0 to 1,
                two decimals) and MusicBrainz id (empty when Last.fm has none). Last.fm autocorrects the
                name; when it resolves to another artist, \`# <name>\` goes to stderr.
            `,
            examples: [['Ten artists like Cher', `${prefix} similar-artists Cher --limit 10`]],
        });

        artist = Option.String({ name: 'artist' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);

            const result = await lastfm(LastfmArtistGetSimilar, { artist: this.artist, limit });
            if (!result) {
                this.context.stderr.write(`Not found: artist ${this.artist}\n`);
                return 1;
            }

            writeResolvedName(this.context.stderr, this.artist, result.artist);
            for (const item of result.items) {
                this.context.stdout.write(formatTsvLine([item.name, item.match.toFixed(2), item.mbid ?? '']));
            }

            return 0;
        }
    };
}
