import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import type { GoogleCommandParams } from './GoogleCommandParams.js';
import { parseGoogleTokens } from './googleTokens.js';
import { isAccountAllowed } from './utils/isAccountAllowed.js';

/**
 * Defines `<prefix> accounts`: one tab-separated line per signed-in account of the service, the email
 * and its granted scopes, or `not allowed` for an account the project's `accounts` option excludes.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGoogleAccountsCommand(params: GoogleCommandParams): CommandClass {
    const { prefix, service } = params;

    return class GoogleAccountsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'accounts']];
        static override usage = Command.Usage({
            category: 'Google',
            description: `List the Google accounts signed in to ${service.name}`,
            details: `
                Prints each signed-in account with its granted scopes, tab-separated; an account
                signed in but not allowed in this project is marked \`not allowed\`. Sign an account
                in with \`${prefix} auth\`.
            `,
        });

        override async run() {
            const auth = this.container.resolve(params.auth);
            const tokens = parseGoogleTokens(await auth.readTokens(), auth.secretName);
            for (const [email, { scopes }] of [...tokens].toSorted(([a], [b]) => a.localeCompare(b))) {
                const status = isAccountAllowed(email, auth.allowed) ? scopes.join(' ') : 'not allowed';
                this.context.stdout.write(`${email}\t${status}\n`);
            }
        }
    };
}
