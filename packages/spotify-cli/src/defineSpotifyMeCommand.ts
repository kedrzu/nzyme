import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { spotifyMeRead } from './operations/spotifyMeRead.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';
import { spotifySignInCommand } from './utils/spotifySignInCommand.js';

/**
 * Defines `<prefix> me`: the signed-in account, `userId  displayName  signed in <date>, expires <date>`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyMeCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyMeCommand extends Command {
        static override paths = [[...prefix.split(' '), 'me']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Show the signed-in Spotify account and when its sign-in expires',
            details: `
                Prints the account's user id and display name, the day it signed in and the day the
                sign-in expires (6 months later); sign in again with \`${prefix} auth\` before then.
            `,
            examples: [['Show the account', `${prefix} me`]],
        });

        override async run() {
            const spotify = this.container.resolve(params.spotify);
            const signInCommand = spotifySignInCommand(this, prefix);
            const token = await spotify.readToken({ signInCommand });
            const profile = await spotifyMeRead(await spotify.getApi({ signInCommand }));

            const signedIn = new Date(token.signedInAt);
            const expires = new Date(signedIn);
            expires.setUTCMonth(expires.getUTCMonth() + 6);
            this.context.stdout.write(
                formatTsvLine([
                    profile.id,
                    profile.displayName ?? '',
                    `signed in ${signedIn.toISOString().slice(0, 10)}, expires ${expires.toISOString().slice(0, 10)}`,
                ]),
            );
        }
    };
}
