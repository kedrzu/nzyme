import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyPlaylistsList } from './operations/spotifyPlaylistsList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> playlist list`: the playlists the account owns or follows,
 * `uri  name  ownerId  total  public|private`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyPlaylistListCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyPlaylistListCommand extends Command {
        static override paths = [[...prefix.split(' '), 'playlist', 'list']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: "List the account's playlists",
            details: `
                One tab-separated line per playlist the account owns or follows: uri, name, owner id,
                item count and public or private (empty when Spotify does not say). \`--limit\` is at
                most 50.
            `,
            examples: [['The first 50 playlists', `${prefix} playlist list --limit 50`]],
        });

        limit = Option.String('--limit', '20', { description: 'The most playlists to list, up to 50' });
        offset = Option.String('--offset', '0', { description: 'How many playlists to skip' });

        override async run() {
            const query = {
                limit: parseSpotifyLimit({ value: this.limit, max: 50 }),
                offset: parseSpotifyOffset(this.offset),
            };
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const page = await spotifyPlaylistsList(api, query);
            for (const playlist of page.items) {
                const visibility = playlist.public === undefined ? '' : playlist.public ? 'public' : 'private';
                this.context.stdout.write(
                    formatTsvLine([playlist.uri, playlist.name, playlist.ownerId, playlist.total ?? '', visibility]),
                );
            }

            if (page.nextOffset !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--offset', page.nextOffset));
            }
        }
    };
}
