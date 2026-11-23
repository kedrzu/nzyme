import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyRecentlyPlayedList } from './operations/spotifyRecentlyPlayedList.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { formatSpotifyMoreHint } from './utils/formatSpotifyMoreHint.js';
import { parseSpotifyLimit } from './utils/parseSpotifyLimit.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> recent`: the tracks played last, newest first, `uri  name  artists  playedAt`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyRecentCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyRecentCommand extends Command {
        static override paths = [[...prefix.split(' '), 'recent']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'List the recently played tracks, newest first',
            details: `
                One tab-separated line per play: uri, name, artists and when it was played. Spotify keeps
                the last 50. When more follow, stderr carries the \`--before\` cursor that reads them.
            `,
            examples: [['The last 10 plays', `${prefix} recent --limit 10`]],
        });

        limit = Option.String('--limit', '20', { description: 'The most plays to list, up to 50' });
        before = Option.String('--before', { description: 'The cursor of the previous answer: plays before it' });

        override async run() {
            const limit = parseSpotifyLimit({ value: this.limit, max: 50 });
            if (this.before !== undefined && !/^\d+$/.test(this.before)) {
                throw new UsageError(`--before must be the cursor an earlier answer gave, got ${this.before}.`);
            }

            const spotify = this.container.resolve(params.spotify);
            const api = await spotify.getApi({ signInCommand: spotifySignInCommand(this, prefix) });

            const page = await spotifyRecentlyPlayedList(api, { limit, before: this.before });
            for (const { item, at } of page.items) {
                this.context.stdout.write(formatTsvLine([item.uri, item.name, item.artists.join(', '), at]));
            }

            if (page.cursor !== undefined) {
                this.context.stderr.write(formatSpotifyMoreHint('--before', page.cursor));
            }
        }
    };
}
