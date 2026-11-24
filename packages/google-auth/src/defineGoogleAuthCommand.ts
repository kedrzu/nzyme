import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import type { GoogleCommandParams } from './GoogleCommandParams.js';
import { parseGoogleTokens } from './googleTokens.js';
import { saveGoogleToken } from './saveGoogleToken.js';
import { signInGoogle } from './signInGoogle.js';

/**
 * Defines `<prefix> auth`: signs an account in to the service in the browser and adds its refresh
 * token to the token secret, keeping the other accounts. Run by a person, not an agent.
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
                port, then adds the account's refresh token to the project's token secret, keeping the
                accounts already signed in. Needs a person at the browser. The URL is printed to stderr too, for when no
                browser opens; \`--no-browser\` only prints it.
            `,
            examples: [['Sign an account in', `${prefix} auth --login-hint me@example.com`]],
        });

        loginHint = Option.String('--login-hint', { description: 'The account to preselect on Google' });
        browser = Option.Boolean('--browser', true, { description: 'Open the sign-in URL in the browser' });

        override async run() {
            const auth = this.container.resolve(params.auth);
            const { endpoints } = auth;

            // A stored value that is not a token dictionary is refused before the browser: the person
            // should not sign in for a save that would fail.
            parseGoogleTokens(await auth.readTokens(), auth.secretName);

            const token = await signInGoogle({
                credentials: await auth.clients.getClient(this.loginHint),
                tokenUrl: endpoints.oauthTokenUrl,
                service,
                apiRootUrl: endpoints.apiRootUrl,
                loginHint: this.loginHint,
                openBrowser: this.browser,
                print: line => this.context.stderr.write(`${line}\n`),
            });
            await saveGoogleToken({ auth, token });
            this.context.stdout.write(
                `${token.email} signed in to ${service.name}; its token is in ${auth.secretName}.\n`,
            );
        }
    };
}
