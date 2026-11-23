import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmArtistGetTopAlbums } from './LastfmArtistGetTopAlbums.js';
import { LastfmArtistGetTopTracks } from './LastfmArtistGetTopTracks.js';
import { lastfmLimitOption, parseLastfmLimit, writeResolvedName } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> artist-top <name> tracks|albums [--limit]`: an artist's most played tracks or
 * albums, `rank  artist  title  playcount  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmArtistTopCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmArtistTopCommand extends Command {
        static override paths = [[...prefix.split(' '), 'artist-top']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "List an artist's most played tracks or albums",
            details: `
                Most played first. Prints one tab-separated line per track or album: rank, artist,
                title, playcount and MusicBrainz id (empty when Last.fm has none). Last.fm autocorrects
                the name; when it resolves to another artist, \`# <name>\` goes to stderr.
            `,
            examples: [
                ["Cher's top tracks", `${prefix} artist-top Cher tracks`],
                ["Cher's top five albums", `${prefix} artist-top Cher albums --limit 5`],
            ],
        });

        name = Option.String({ name: 'name' });
        subject = Option.String({ name: 'tracks|albums' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);

            switch (this.subject) {
                case 'tracks':
                    return await this.listTracks(limit);
                case 'albums':
                    return await this.listAlbums(limit);
                default:
                    throw new UsageError(`Expected tracks or albums, got ${this.subject}.`);
            }
        }

        private async listTracks(limit: number) {
            const lastfm = this.container.resolve(params.client);
            const result = await lastfm(LastfmArtistGetTopTracks, { artist: this.name, limit });
            if (!result) {
                return this.notFound();
            }

            writeResolvedName(this.context.stderr, this.name, result.artist);
            for (const item of result.items) {
                this.context.stdout.write(
                    formatTsvLine([item.rank, item.artist.name, item.name, item.playcount, item.mbid ?? '']),
                );
            }

            return 0;
        }

        private async listAlbums(limit: number) {
            const lastfm = this.container.resolve(params.client);
            const result = await lastfm(LastfmArtistGetTopAlbums, { artist: this.name, limit });
            if (!result) {
                return this.notFound();
            }

            writeResolvedName(this.context.stderr, this.name, result.artist);
            // Last.fm ranks no album here; the list is most played first, so the position is the rank.
            for (const [index, item] of result.items.entries()) {
                this.context.stdout.write(
                    formatTsvLine([index + 1, item.artist.name, item.name, item.playcount, item.mbid ?? '']),
                );
            }

            return 0;
        }

        private notFound() {
            this.context.stderr.write(`Not found: artist ${this.name}\n`);
            return 1;
        }
    };
}
