import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyPlaylistItemsList } from './operations/spotifyPlaylistItemsList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyId } from './utils/parseSpotifyId.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { parseSpotifyOffset } from './utils/parseSpotifyOffset.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> playlist items <playlist>`: the playlist's items, `uri  name  artists  addedAt`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyPlaylistItemsCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyPlaylistItemsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'playlist', 'items']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'List the items of a playlist',
            details: `
                One tab-separated line per item: uri, name, artists and when it was added. Spotify only
                serves the contents of the account's own and collaborative playlists. The playlist is an
                id, a \`spotify:playlist:<id>\` URI or an open.spotify.com link. \`--limit\` is at most 50.
            `,
            examples: [['The items of a playlist', `${prefix} playlist items 37i9dQZF1DXcBWIGoYBM5M`]],
        });

        playlist = Option.String({ name: 'playlist' });
        limit = Option.String('--limit', '20', { description: 'The most items to list, up to 50' });
        offset = Option.String('--offset', '0', { description: 'How many items to skip' });

        override async run() {
            const playlist = parseSpotifyId(this.playlist, 'playlist');
            const limit = parseSpotifyLimit({ value: this.limit, max: 50 });
            const offset = parseSpotifyOffset(this.offset);
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const page = await spotifyPlaylistItemsList(api, { playlist, limit, offset });
            if (!page) {
                throw new UsageError(
                    'Spotify only serves the contents of your own and collaborative playlists, and this is neither.',
                );
            }

            for (const { item, at } of page.items) {
                this.context.stdout.write(formatTsvLine([item.uri, item.name, item.artists.join(', '), at]));
            }

            if (page.nextOffset !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--offset', page.nextOffset));
            }
        }
    };
}
