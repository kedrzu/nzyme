import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmArtistGetInfo } from './LastfmArtistGetInfo.js';
import { cleanLastfmText } from './utils/cleanLastfmText.js';

/**
 * Defines `<prefix> artist <name>`: an artist's profile as a `key: value` block, then its similar
 * artists.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmArtistCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmArtistCommand extends Command {
        static override paths = [[...prefix.split(' '), 'artist']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "Show an artist's profile",
            details: `
                Prints a \`key: value\` block: name (as Last.fm resolved it), mbid, url, listeners,
                playcount, tags (comma-separated) and a short plain-text bio; a field Last.fm has no
                value for is left out. Then \`similar:\` with one indented similar artist name per line
                (Last.fm sends no MusicBrainz ids for them; look one up with \`${prefix} artist <name>\`).
            `,
            examples: [['Cher', `${prefix} artist Cher`]],
        });

        name = Option.String({ name: 'name' });

        override async run() {
            const lastfm = this.container.resolve(params.client);

            const artist = await lastfm(LastfmArtistGetInfo, { artist: this.name });
            if (!artist) {
                this.context.stderr.write(`Not found: artist ${this.name}\n`);
                return 1;
            }

            this.context.stdout.write(
                formatHeaderBlock([
                    ['name', artist.name],
                    ['mbid', artist.mbid ?? ''],
                    ['url', artist.url ?? ''],
                    ['listeners', String(artist.listeners)],
                    ['playcount', String(artist.playcount)],
                    ['tags', artist.tags.map(tag => tag.name).join(', ')],
                    ['bio', cleanLastfmText(artist.summary)],
                ]),
            );

            if (artist.similar.length) {
                this.context.stdout.write('similar:\n');
                for (const similar of artist.similar) {
                    this.context.stdout.write(`  ${formatTsvLine([similar.name])}`);
                }
            }

            return 0;
        }
    };
}
