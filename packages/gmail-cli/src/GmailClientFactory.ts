import type { gmail_v1 } from '@googleapis/gmail';
import { gmail } from '@googleapis/gmail';

import { CommandScope } from '@nzyme/cli-core/Command.js';
import { GoogleAccounts } from '@nzyme/google-auth/GoogleAccounts.js';
import { GoogleEndpoints } from '@nzyme/google-auth/GoogleEndpoints.js';
import { defineFactory } from '@nzyme/ioc/Factory.js';

import type { GmailCommandParams } from './GmailCommandsOptions.js';

/**
 * The second argument of every Gmail API call. The API root is honoured only here: the client's
 * global `rootUrl` is ignored, by media uploads among others.
 */
export interface GmailCallOptions {
    /** The fake's root in tests, unset (Google's) otherwise. */
    rootUrl: string | undefined;
}

/** The Gmail API authorised as one account. */
export interface GmailClient {
    email: string;
    gmail: gmail_v1.Gmail;
    /** Pass to every call: `gmail.users.labels.list({ userId: 'me' }, call)`. */
    call: GmailCallOptions;
}

/**
 * Authorises the account a command acts on (`--account`, or the only usable one) and returns the API
 * client with the call options every request needs.
 * @param binaryName The CLI binary, so the sign-in command in errors can be run as is.
 */
export const GmailClientFactory = defineFactory({
    name: 'GmailClientFactory',
    scope: CommandScope,
    deps: { googleAccounts: GoogleAccounts, endpoints: GoogleEndpoints },
    async setup(
        { googleAccounts, endpoints },
        params: GmailCommandParams,
        binaryName: string,
        account: string | undefined,
    ): Promise<GmailClient> {
        const accounts = googleAccounts(params, binaryName);
        const email = await accounts.resolveAccount(account);
        const auth = await accounts.authorize(email);

        return { email, gmail: gmail({ version: 'v1', auth }), call: { rootUrl: endpoints.apiRootUrl } };
    },
});
