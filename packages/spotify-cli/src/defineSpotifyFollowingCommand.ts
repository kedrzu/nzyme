import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { spotifyFollowedArtistsList } from './operations/spotifyFollowedArtistsList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyArtistLine } from './utils/formatSpotifyArtistLine.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> following`: the followed artists, `uri  name  genres`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyFollowingCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyFollowingCommand extends Command {
        static override paths = [[...prefix.split(' '), 'following']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'List the artists the account follows',
            details: `
                One tab-separated line per artist: uri, name and genres (often empty). Spotify pages
                this list by cursor: when more follow, stderr carries the \`--after\` cursor that reads
                them. \`--limit\` is at most 50.
            `,
            examples: [['The followed artists', `${prefix} following`]],
        });

        limit = Option.String('--limit', '20', { description: 'The most artists to list, up to 50' });
        after = Option.String('--after', { description: 'The cursor of the previous answer: artists after it' });

        override async run() {
            const limit = parseSpotifyLimit({ value: this.limit, max: 50 });
            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const page = await spotifyFollowedArtistsList(api, { limit, after: this.after });
            for (const artist of page.items) {
                this.context.stdout.write(formatSpotifyArtistLine(artist));
            }

            if (page.cursor !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--after', page.cursor));
            }
        }
    };
}
