import type { drive_v3 } from '@googleapis/drive';
import { drive } from '@googleapis/drive';

import { CommandScope } from '@nzyme/cli-core/Command.js';
import { GoogleAccounts } from '@nzyme/google-auth/GoogleAccounts.js';
import { GoogleEndpoints } from '@nzyme/google-auth/GoogleEndpoints.js';
import { defineFactory } from '@nzyme/ioc/Factory.js';

import type { DriveCommandParams } from './DriveCommandsOptions.js';

/**
 * The second argument of every Drive API call. The API root is honoured only here: the client's
 * global `rootUrl` is ignored by media uploads and downloads.
 */
export interface DriveCallOptions {
    /** The fake's root in tests, unset (Google's) otherwise. */
    rootUrl: string | undefined;
}

/** The Drive API authorised as one account. */
export interface DriveClient {
    email: string;
    drive: drive_v3.Drive;
    /** Pass to every call: `drive.files.get({ fileId, supportsAllDrives: true }, call)`. */
    call: DriveCallOptions;
}

/**
 * Authorises the account a command acts on (`--account`, or the only usable one) and returns the API
 * client with the call options every request needs.
 * @param binaryName The CLI binary, so the sign-in command in errors can be run as is.
 */
export const DriveClientFactory = defineFactory({
    name: 'DriveClientFactory',
    scope: CommandScope,
    deps: { googleAccounts: GoogleAccounts, endpoints: GoogleEndpoints },
    async setup(
        { googleAccounts, endpoints },
        params: DriveCommandParams,
        binaryName: string,
        account: string | undefined,
    ): Promise<DriveClient> {
        const accounts = googleAccounts(params, binaryName);
        const email = await accounts.resolveAccount(account);
        const auth = await accounts.authorize(email);

        return { email, drive: drive({ version: 'v3', auth }), call: { rootUrl: endpoints.apiRootUrl } };
    },
});
