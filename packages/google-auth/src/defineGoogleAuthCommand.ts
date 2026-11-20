import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { GoogleAccountsFactory } from './GoogleAccountsFactory.js';
import type { GoogleCommandParams } from './GoogleCommandParams.js';
import { GoogleEndpoints } from './GoogleEndpoints.js';
import { signInGoogle } from './signInGoogle.js';

/**
 * Defines `<prefix> auth`: signs an account in to the service in the browser and writes its refresh
 * token to the secret store the provider's `target` picks. Run by a person, not an agent.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGoogleAuthCommand(params: GoogleCommandParams): CommandClass {
    const { prefix, service } = params;

    return class GoogleAuthCommand extends Command {
        static override paths = [[...prefix.split(' '), 'auth']];
        static override usage = Command.Usage({
            category: 'Google',
            description: `Sign a Google account in to ${service.name}`,
            details: `
                Opens Google's consent page in the browser and waits for the redirect on a loopback
                port, then writes the account's refresh token to the secret store the project picks for
                its key. Needs a person at the browser. The URL is printed to stderr too, for when no
                browser opens; \`--no-browser\` only prints it.
            `,
            examples: [['Sign an account in', `${prefix} auth --login-hint me@example.com`]],
        });

        loginHint = Option.String('--login-hint', { description: 'The account to preselect on Google' });
        browser = Option.Boolean('--browser', true, { description: 'Open the sign-in URL in the browser' });

        override async run() {
            const accounts = this.container.resolve(GoogleAccountsFactory)(params, this.cli.binaryName);
            const endpoints = this.container.resolve(GoogleEndpoints);

            const token = await signInGoogle({
                client: await accounts.createClient(),
                service,
                apiRootUrl: endpoints.apiRootUrl,
                loginHint: this.loginHint,
                openBrowser: this.browser,
                print: line => this.context.stderr.write(`${line}\n`),
            });
            const saved = await accounts.saveToken(token);
            this.context.stdout.write(
                `${token.email} signed in to ${service.name}; its token is in ${saved.key} (store ${saved.storeId}).\n`,
            );
        }
    };
}
