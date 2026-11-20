import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { GoogleAccountsFactory } from './GoogleAccountsFactory.js';
import type { GoogleCommandParams } from './GoogleCommandParams.js';

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
            const accounts = this.container.resolve(GoogleAccountsFactory)(params, this.cli.binaryName);
            for (const account of await accounts.list()) {
                const status = account.allowed ? account.scopes.join(' ') : 'not allowed';
                this.context.stdout.write(`${account.email}\t${status}\n`);
            }
        }
    };
}
