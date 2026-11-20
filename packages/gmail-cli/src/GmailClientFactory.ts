import type { gmail_v1 } from '@googleapis/gmail';
import { gmail } from '@googleapis/gmail';

import { CommandScope } from '@nzyme/cli-core/Command.js';
import { GoogleAccountsFactory } from '@nzyme/google-auth/GoogleAccountsFactory.js';
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

/** Arguments of the function {@link GmailClientFactory} returns. */
export interface GmailClientFactoryParams {
    /** The params the Gmail commands are defined with. */
    params: GmailCommandParams;
    /** The CLI binary, so the sign-in command in errors can be run as is. */
    binaryName: string;
    /** The account to act as (`--account`); unset picks the only usable one. */
    account: string | undefined;
}

/**
 * Authorises the account a command acts on (`--account`, or the only usable one) and returns the API
 * client with the call options every request needs.
 */
export const GmailClientFactory = defineFactory({
    name: 'GmailClientFactory',
    scope: CommandScope,
    deps: { googleAccounts: GoogleAccountsFactory, endpoints: GoogleEndpoints },
    async setup(
        { googleAccounts, endpoints },
        { params, binaryName, account }: GmailClientFactoryParams,
    ): Promise<GmailClient> {
        const accounts = googleAccounts(params, binaryName);
        const email = await accounts.resolveAccount(account);
        const auth = await accounts.authorize(email);

        return { email, gmail: gmail({ version: 'v1', auth }), call: { rootUrl: endpoints.apiRootUrl } };
    },
});
