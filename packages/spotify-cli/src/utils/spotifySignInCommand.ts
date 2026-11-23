import type { Command } from '@nzyme/cli-core/Command.js';

/**
 * The sign-in command as the person types it (`nzyme spotify auth`), for the `signInCommand` of the
 * `defineSpotify` calls a command makes.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function spotifySignInCommand(command: Command, prefix: string): string {
    return `${command.cli.binaryName} ${prefix} auth`;
}
