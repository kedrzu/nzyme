import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmUserGetRecentTracks } from './LastfmUserGetRecentTracks.js';
import { lastfmLimitOption, parseLastfmLimit } from './utils/lastfmCommandHelpers.js';

/**
 * Defines `<prefix> user-recent <user> [--limit]`: the tracks a user played, latest first,
 * `time  artist  track  album  mbid`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmUserRecentCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmUserRecentCommand extends Command {
        static override paths = [[...prefix.split(' '), 'user-recent']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: 'List the tracks a user played recently',
            details: `
                Latest first. Prints one tab-separated line per play: time (ISO 8601 UTC, or \`now\` for
                the track playing right now), artist, track, album (empty when the scrobble names none)
                and the track's MusicBrainz id (empty when Last.fm has none).
            `,
            examples: [["rj's last ten plays", `${prefix} user-recent rj --limit 10`]],
        });

        user = Option.String({ name: 'user' });
        limit = lastfmLimitOption();

        override async run() {
            const limit = parseLastfmLimit(this.limit);
            const lastfm = this.container.resolve(params.client);

            const result = await lastfm(LastfmUserGetRecentTracks, { user: this.user, limit });
            if (!result) {
                this.context.stderr.write(`Not found: user ${this.user}\n`);
                return 1;
            }

            // With a track playing now, Last.fm returns it on top of `limit` played ones.
            for (const item of result.items.slice(0, limit)) {
                this.context.stdout.write(
                    formatTsvLine([
                        formatPlayedAt(item.playedAt, item.nowPlaying),
                        item.artist.name,
                        item.name,
                        item.album?.name ?? '',
                        item.mbid ?? '',
                    ]),
                );
            }

            return 0;
        }
    };
}

/** `now` for the track playing now, otherwise ISO 8601 UTC to the second (`2026-11-20T18:04:00Z`). */
function formatPlayedAt(playedAt: Date | null, nowPlaying: boolean) {
    if (nowPlaying || !playedAt) {
        return 'now';
    }

    return playedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
