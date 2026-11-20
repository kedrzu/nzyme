import * as path from 'node:path';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { defineGoogleAccountsCommand } from '@nzyme/google-auth/defineGoogleAccountsCommand.js';
import { defineGoogleAuth } from '@nzyme/google-auth/defineGoogleAuth.js';
import { defineGoogleAuthCommand } from '@nzyme/google-auth/defineGoogleAuthCommand.js';

import { defineDriveDownloadCommand } from './defineDriveDownloadCommand.js';
import { defineDriveDrivesCommand } from './defineDriveDrivesCommand.js';
import { defineDriveInfoCommand } from './defineDriveInfoCommand.js';
import { defineDriveLsCommand } from './defineDriveLsCommand.js';
import { defineDriveMetaCommand } from './defineDriveMetaCommand.js';
import { defineDriveMkdirCommand } from './defineDriveMkdirCommand.js';
import { defineDriveReadCommand } from './defineDriveReadCommand.js';
import { defineDriveSearchCommand } from './defineDriveSearchCommand.js';
import { defineDriveTrashCommand } from './defineDriveTrashCommand.js';
import { defineDriveUpdateCommand } from './defineDriveUpdateCommand.js';
import { defineDriveUploadCommand } from './defineDriveUploadCommand.js';
import type { DriveCommandParams, DriveCommandsOptions } from './DriveCommandsOptions.js';
import { driveService } from './driveService.js';
import type { DrivePermission } from './permissions.js';
import { effectivePermissions } from './permissions.js';

/**
 * Defines the Drive commands the project's permissions allow: sign-in and accounts always; search,
 * `ls`, `info` and `drives` with `browse`; `read` and `download` with `download`; `upload` and `mkdir`
 * with `upload`; `update` and `meta` with `edit`; `trash` and `restore` with `delete`. A command whose
 * permission is off is not registered at all. None deletes a file permanently, empties the trash or
 * edits sharing settings, but moving or uploading into a shared folder or shared drive inherits its
 * sharing. Throws when a `files` path is not absolute.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveCommands(options: DriveCommandsOptions): CommandClass[] {
    const { prefix = 'drive', auth, files } = options;

    for (const dir of [...(files?.roots ?? []), ...(files?.downloadsDir === undefined ? [] : [files.downloadsDir])]) {
        if (!path.isAbsolute(dir)) {
            throw new Error(`Invalid Drive command options: files: '${dir}' must be an absolute path`);
        }
    }

    const params: DriveCommandParams = { prefix, service: driveService, auth: defineGoogleAuth(auth), files };
    const permissions = effectivePermissions(options.permissions);
    const commands: [DrivePermission, CommandClass][] = [
        ['browse', defineDriveSearchCommand(params)],
        ['browse', defineDriveLsCommand(params)],
        ['browse', defineDriveInfoCommand(params)],
        ['browse', defineDriveDrivesCommand(params)],
        ['download', defineDriveReadCommand(params)],
        ['download', defineDriveDownloadCommand(params)],
        ['upload', defineDriveUploadCommand(params)],
        ['upload', defineDriveMkdirCommand(params)],
        ['edit', defineDriveUpdateCommand(params)],
        ['edit', defineDriveMetaCommand(params)],
        ['delete', defineDriveTrashCommand(params, true)],
        ['delete', defineDriveTrashCommand(params, false)],
    ];

    return [
        defineGoogleAuthCommand(params),
        defineGoogleAccountsCommand(params),
        ...commands.filter(([permission]) => permissions[permission]).map(([, command]) => command),
    ];
}
