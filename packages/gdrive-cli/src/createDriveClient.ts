import type { drive_v3 } from '@googleapis/drive';
import { drive } from '@googleapis/drive';

import { authorizeGoogleAccount } from '@nzyme/google-auth/authorizeGoogleAccount.js';
import type { GoogleAuthShape } from '@nzyme/google-auth/defineGoogleAuth.js';

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

/** Params of {@link createDriveClient}. */
export interface CreateDriveClientParams {
    /** The set's auth, resolved from `params.auth`. */
    auth: GoogleAuthShape;
    /** The params the Drive commands are defined with. */
    params: DriveCommandParams;
    /** The CLI binary, so the sign-in command in errors can be run as is. */
    binaryName: string;
    /** The account to act as (`--account`); unset picks the only usable one. */
    account: string | undefined;
}

/**
 * Authorises the account a command acts on (`--account`, or the only usable one) and returns the API
 * client with the call options every request needs.
 */
export async function createDriveClient({
    auth,
    params,
    binaryName,
    account,
}: CreateDriveClientParams): Promise<DriveClient> {
    const { email, client } = await authorizeGoogleAccount({
        auth,
        service: params.service,
        account,
        signInCommand: `${binaryName} ${params.prefix} auth`,
    });

    return { email, drive: drive({ version: 'v3', auth: client }), call: { rootUrl: auth.endpoints.apiRootUrl } };
}
