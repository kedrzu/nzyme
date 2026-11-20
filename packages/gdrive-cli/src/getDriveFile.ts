import type { drive_v3 } from '@googleapis/drive';

import type { DriveClient } from './DriveClientFactory.js';
import { SHORTCUT } from './formats.js';

/** The fields every command reads of a file. */
export const FILE_FIELDS =
    'id, name, mimeType, size, modifiedTime, parents, driveId, webViewLink, trashed, starred, shortcutDetails(targetId, targetMimeType)';

/** Options of {@link getDriveFile}. */
export interface GetDriveFileOptions {
    /** Default {@link FILE_FIELDS}. */
    fields?: string;
    /** Read the target of a shortcut instead of the shortcut. */
    followShortcut?: boolean;
}

/**
 * A file's metadata, in any drive the account can reach.
 */
export async function getDriveFile(
    { drive, call }: DriveClient,
    fileId: string,
    options: GetDriveFileOptions = {},
): Promise<drive_v3.Schema$File> {
    const fields = options.fields ?? FILE_FIELDS;
    const file = await drive.files.get({ fileId, fields, supportsAllDrives: true }, call);
    const target = file.data.shortcutDetails?.targetId;
    if (options.followShortcut && file.data.mimeType === SHORTCUT && target) {
        const followed = await drive.files.get({ fileId: target, fields, supportsAllDrives: true }, call);
        return followed.data;
    }

    return file.data;
}
