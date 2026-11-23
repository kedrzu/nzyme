import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmTrackGetInfo } from './LastfmTrackGetInfo.js';
import { cleanLastfmText } from './utils/cleanLastfmText.js';
import { formatLastfmDuration } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> track <artist> <track>`: a track's profile as a `key: value` block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmTrackCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmTrackCommand extends Command {
        static override paths = [[...prefix.split(' '), 'track']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "Show a track's profile",
            details: `
                Prints a \`key: value\` block: name and artist (as Last.fm resolved them), mbid, url,
                duration (m:ss), listeners, playcount, album, tags (comma-separated) and a short
                plain-text summary; a field Last.fm has no value for is left out.
            `,
            examples: [['Believe by Cher', `${prefix} track Cher Believe`]],
        });

        artist = Option.String({ name: 'artist' });
        track = Option.String({ name: 'track' });

        override async run() {
            const lastfm = this.container.resolve(params.client);

            const track = await lastfm(LastfmTrackGetInfo, { artist: this.artist, track: this.track });
            if (!track) {
                this.context.stderr.write(`Not found: track ${this.artist} - ${this.track}\n`);
                return 1;
            }

            this.context.stdout.write(
                formatHeaderBlock([
                    ['name', track.name],
                    ['artist', track.artist.name],
                    ['mbid', track.mbid ?? ''],
                    ['url', track.url ?? ''],
                    ['duration', formatLastfmDuration(track.duration)],
                    ['listeners', String(track.listeners)],
                    ['playcount', String(track.playcount)],
                    ['album', track.album?.name ?? ''],
                    ['tags', track.tags.map(tag => tag.name).join(', ')],
                    ['summary', cleanLastfmText(track.summary)],
                ]),
            );

            return 0;
        }
    };
}
