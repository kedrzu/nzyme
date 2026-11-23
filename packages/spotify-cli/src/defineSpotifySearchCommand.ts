import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { SpotifySearchType } from './operations/spotifySearch.js';
import { spotifySearch } from './operations/spotifySearch.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

const TYPES = ['artist', 'track', 'album', 'playlist'] as const;

/**
 * Defines `<prefix> search <query>`: `type  uri  name  detail` per hit, with the artists of a track or
 * album, the genres of an artist or the owner of a playlist as the detail.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifySearchCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifySearchCommand extends Command {
        static override paths = [[...prefix.split(' '), 'search']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Search the Spotify catalogue',
            details: `
                One tab-separated line per hit: type, uri, name and a detail (artists for tracks and
                albums, genres for artists, owner for playlists). \`--type\` is a comma list of
                ${TYPES.join(', ')} (default artist,track,album). \`--limit\` is per type and at most 10.
            `,
            examples: [['Find a track', `${prefix} search "radiohead karma police" --type track`]],
        });

        query = Option.String({ name: 'query' });
        type = Option.String('--type', 'artist,track,album', { description: `Comma list of ${TYPES.join(', ')}` });
        limit = Option.String('--limit', '10', { description: 'The most hits per type, up to 10' });
        offset = Option.String('--offset', '0', { description: 'How many hits per type to skip' });

        override async run() {
            const types = this.parseTypes();
            const limit = parseSpotifyLimit({ value: this.limit, max: 10 });
            const offset = parseSpotifyOffset(this.offset);
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const results = await spotifySearch(api, { query: this.query, types, limit, offset });
            const out = this.context.stdout;
            for (const artist of results.artists?.items ?? []) {
                out.write(formatTsvLine(['artist', artist.uri, artist.name, artist.genres.join(', ')]));
            }

            for (const track of results.tracks?.items ?? []) {
                out.write(formatTsvLine(['track', track.uri, track.name, track.artists.join(', ')]));
            }

            for (const album of results.albums?.items ?? []) {
                out.write(formatTsvLine(['album', album.uri, album.name, album.artists.join(', ')]));
            }

            for (const playlist of results.playlists?.items ?? []) {
                out.write(formatTsvLine(['playlist', playlist.uri, playlist.name, playlist.ownerId]));
            }

            const pages = [results.artists, results.tracks, results.albums, results.playlists];
            if (pages.some(page => page?.nextOffset !== undefined)) {
                this.context.stderr.write(formatSpotifyMoreHint('--offset', offset + limit));
            }
        }

        private parseTypes() {
            const types: SpotifySearchType[] = [];
            for (const name of this.type.split(',').map(part => part.trim())) {
                const type = TYPES.find(candidate => candidate === name);
                if (!type) {
                    throw new UsageError(
                        `--type takes ${TYPES.join(', ')} (comma-separated), got ${name || 'nothing'}.`,
                    );
                }

                if (!types.includes(type)) {
                    types.push(type);
                }
            }

            return types;
        }
    };
}
