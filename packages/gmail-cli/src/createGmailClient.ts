import type { gmail_v1 } from '@googleapis/gmail';
import { gmail } from '@googleapis/gmail';

import { authorizeGoogleAccount } from '@nzyme/google-auth/authorizeGoogleAccount.js';
import type { GoogleAuthShape } from '@nzyme/google-auth/defineGoogleAuth.js';

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

/** Params of {@link createGmailClient}. */
export interface CreateGmailClientParams {
    /** The set's auth, resolved from `params.auth`. */
    auth: GoogleAuthShape;
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
export async function createGmailClient({
    auth,
    params,
    binaryName,
    account,
}: CreateGmailClientParams): Promise<GmailClient> {
    const { email, client } = await authorizeGoogleAccount({
        auth,
        service: params.service,
        account,
        signInCommand: `${binaryName} ${params.prefix} auth`,
    });

    return { email, gmail: gmail({ version: 'v1', auth: client }), call: { rootUrl: auth.endpoints.apiRootUrl } };
}
