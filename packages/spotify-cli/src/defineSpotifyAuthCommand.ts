import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { signInSpotify } from './signInSpotify.js';
import type { SpotifyCommandParams } from './SpotifyCommandParams.js';

/**
 * Defines `<prefix> auth`: signs the account in to Spotify in the browser and stores its refresh token
 * in the token secret, replacing whatever it held (one account per command set, so a malformed value is
 * overwritten too). Run by a person, not an agent.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotifyAuthCommand(params: SpotifyCommandParams): CommandClass {
    const { prefix } = params;

    return class SpotifyAuthCommand extends Command {
        static override paths = [[...prefix.split(' '), 'auth']];
        static override usage = Command.Usage({
            category: 'Spotify',
            description: 'Sign the Spotify account in',
            details: `
                Opens Spotify's consent page in the browser and waits for the redirect on the app's
                registered redirect URI (\`http://127.0.0.1:8888/callback\` by default), then stores the
                account's refresh token in the project's token secret. Needs a person at the browser. The
                URL is printed to stderr too, for when no browser opens; \`--no-browser\` only prints it. A
                sign-in lasts 6 months.
            `,
            examples: [['Sign the account in', `${prefix} auth`]],
        });

        browser = Option.Boolean('--browser', true, { description: 'Open the sign-in URL in the browser' });

        override async run() {
            const spotify = this.container.resolve(params.spotify);

            // Refused up front: the person should not sign in for a write that would fail.
            spotify.assertTokenWritable();

            const { token, displayName } = await signInSpotify({
                clientId: spotify.clientId,
                redirectUri: spotify.redirectUri,
                accountsUrl: spotify.endpoints.accountsUrl,
                apiUrl: spotify.endpoints.apiUrl,
                openBrowser: this.browser,
                print: line => this.context.stderr.write(`${line}\n`),
            });
            await spotify.writeToken(token);
            this.context.stdout.write(
                `${displayName} (${token.userId}) signed in to Spotify; its token is in ${spotify.secretName}.\n`,
            );
        }
    };
}
