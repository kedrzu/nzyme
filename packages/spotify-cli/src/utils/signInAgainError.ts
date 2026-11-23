import { UsageError } from '@nzyme/cli-core';

/**
 * The error of every case only a new sign-in fixes: no token, a malformed one, one Spotify rejects, a
 * missing scope. `signInCommand` is the CLI command to name (`<binary> <prefix> auth`); a program
 * outside a CLI passes none and gets a generic pointer.
 * @__NO_SIDE_EFFECTS__
 */
export function signInAgainError(reason: string, signInCommand: string | undefined): UsageError {
    const action = signInCommand
        ? `Sign in again with \`${signInCommand}\`.`
        : 'Sign in again with the `auth` command of the Spotify CLI.';
    return new UsageError(`${reason} ${action}`);
}
