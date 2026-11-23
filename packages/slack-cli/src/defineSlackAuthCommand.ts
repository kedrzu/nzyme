import { WebAPIPlatformError, WebClient } from '@slack/web-api';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { createPkcePair } from '@nzyme/node-utils/createPkcePair.js';
import { listenForOAuthCallback } from '@nzyme/node-utils/listenForOAuthCallback.js';
import { openInBrowser } from '@nzyme/node-utils/openInBrowser.js';
import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { buildSlackAuthorizeUrl } from './buildSlackAuthorizeUrl.js';
import type { SlackAuthShape } from './defineSlackAuth.js';
import { readSlackUserTokenGrant } from './readSlackUserTokenGrant.js';
import type { SlackUserTokenGrant } from './readSlackUserTokenGrant.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Defines `<prefix> auth`: signs the developer in to Slack through the product's Slack app and stores
 * their user-token grant in the auth's token secret — what every other Slack command speaks with. The
 * app uses PKCE, so the redirect lands straight on this process at `http://localhost` and no client
 * secret exists anywhere: the client id is public and the per-run verifier proves the exchange. Slack
 * rotates a PKCE app's tokens, so the refresh token is stored with it and the auth keeps it fresh.
 * Nothing secret is ever printed.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackAuthCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackAuthCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'auth']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Sign in to Slack and store your user token',
            details:
                'Opens the Slack consent page for the Slack app, catches the redirect on the localhost redirect ' +
                'URI registered on it, exchanges the code (PKCE, no client secret) and stores the token in your ' +
                'personal secret store.',
            examples: [['Sign in to Slack', `${prefix} auth`]],
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const auth = this.container.resolve(this.slackAuth);
            const { clientId, userScopes, redirectUri } = auth.options;
            const state = crypto.randomUUID();
            const pkce = createPkcePair();
            // Before the browser opens: a bad redirect URI or a taken port fails here, not after consent.
            const callback = listenForOAuthCallback({ redirectUri, state, timeoutMs: AUTH_TIMEOUT_MS });

            const authorizeUrl = buildSlackAuthorizeUrl({
                clientId,
                userScopes,
                redirectUri,
                state,
                codeChallenge: pkce.challenge,
            });
            this.context.stdout.write(`Opening Slack in your browser. If it does not open, visit:\n${authorizeUrl}\n`);
            openInBrowser(authorizeUrl);

            const result = await callback.result;
            switch (result.kind) {
                case 'timeout':
                    this.context.stderr.write(
                        `No answer from Slack within 5 minutes — run \`${prefix} auth\` again.\n`,
                    );
                    return SLACK_EXIT_CODE.WAIT_TIMED_OUT;
                case 'denied':
                    this.context.stderr.write(`Slack did not authorize the app (${result.error}).\n`);
                    return SLACK_EXIT_CODE.UNAVAILABLE;
                case 'code':
                    break;
            }

            const grant = await this.exchangeCode({ auth, code: result.code, codeVerifier: pkce.verifier });
            if (!grant) {
                return SLACK_EXIT_CODE.UNAVAILABLE;
            }

            const identity = await new WebClient(grant.accessToken).auth.test();
            assert(identity.user, 'auth.test succeeded without a user in its response');

            await auth.store(grant);
            this.context.stdout.write(`Signed in as ${identity.user} (${identity.user_id}).\n`);
            this.context.stdout.write(`${auth.options.token.name} stored in your personal secret store.\n`);
            return SLACK_EXIT_CODE.SUCCESS;
        }

        /**
         * Exchanges the authorization code for the developer's user-token grant, proving it with the
         * PKCE verifier instead of a client secret. `apiCall` because the SDK's typed `oauth.v2.access`
         * demands a `client_secret` and has no `code_verifier`. A rejection here is about the app or the
         * code, never about the stored token — which is what the shared failure mapping would say — so
         * it is reported here.
         */
        private async exchangeCode(exchange: SlackCodeExchange): Promise<SlackUserTokenGrant | null> {
            const { auth, code, codeVerifier } = exchange;
            let response: unknown;
            try {
                response = await new WebClient().apiCall('oauth.v2.access', {
                    client_id: auth.options.clientId,
                    code,
                    code_verifier: codeVerifier,
                    redirect_uri: auth.options.redirectUri,
                });
            } catch (error) {
                if (!(error instanceof WebAPIPlatformError)) {
                    throw error;
                }

                this.context.stderr.write(
                    `Slack refused the code exchange (${error.data.error}) — check the client id configured for ` +
                        `this CLI against the Slack app, then run \`${prefix} auth\` again.\n`,
                );
                return null;
            }

            const grant = readSlackUserTokenGrant(isPlainObject(response) ? response.authed_user : undefined);
            assert(
                grant,
                'oauth.v2.access succeeded without the access token, refresh token and expiry under authed_user',
            );
            return grant;
        }
    };
}

/** One code exchange of a sign-in. */
interface SlackCodeExchange {
    auth: SlackAuthShape;
    code: string;
    codeVerifier: string;
}
