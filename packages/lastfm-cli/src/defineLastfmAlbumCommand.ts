import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmAlbumGetInfo } from './LastfmAlbumGetInfo.js';
import { cleanLastfmText } from './utils/cleanLastfmText.js';
import { formatLastfmDuration } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> album <artist> <album>`: an album's profile as a `key: value` block, then its
 * track list.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmAlbumCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmAlbumCommand extends Command {
        static override paths = [[...prefix.split(' '), 'album']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "Show an album's profile and track list",
            details: `
                Prints a \`key: value\` block: name and artist (as Last.fm resolved them), mbid, url,
                listeners, playcount, tags (comma-separated) and a short plain-text summary; a field
                Last.fm has no value for is left out. Then \`tracks:\` with one indented tab-separated
                line per track: position, title and duration (m:ss, empty when unknown).
            `,
            examples: [['Believe by Cher', `${prefix} album Cher Believe`]],
        });

        artist = Option.String({ name: 'artist' });
        album = Option.String({ name: 'album' });

        override async run() {
            const lastfm = this.container.resolve(params.client);

            const album = await lastfm(LastfmAlbumGetInfo, { artist: this.artist, album: this.album });
            if (!album) {
                this.context.stderr.write(`Not found: album ${this.artist} - ${this.album}\n`);
                return 1;
            }

            this.context.stdout.write(
                formatHeaderBlock([
                    ['name', album.name],
                    ['artist', album.artist.name],
                    ['mbid', album.mbid ?? ''],
                    ['url', album.url ?? ''],
                    ['listeners', String(album.listeners)],
                    ['playcount', String(album.playcount)],
                    ['tags', album.tags.map(tag => tag.name).join(', ')],
                    ['summary', cleanLastfmText(album.summary)],
                ]),
            );

            if (album.tracks.length) {
                this.context.stdout.write('tracks:\n');
                for (const track of album.tracks) {
                    this.context.stdout.write(
                        `  ${formatTsvLine([track.rank, track.name, formatLastfmDuration(track.duration)])}`,
                    );
                }
            }

            return 0;
        }
    };
}
