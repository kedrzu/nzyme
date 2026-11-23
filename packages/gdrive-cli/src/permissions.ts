// What a project lets an agent do in Drive: five switches, each covering a set of commands.
//
// The OAuth scope is the full `drive` scope, because one token serves every project that uses the
// account. The switches are enforced by `defineDriveCommands` instead: a command whose permission is
// off is never registered.

import { immutable } from '@nzyme/utils/immutable.js';

/** One Drive permission switch. */
export type DrivePermission = 'browse' | 'download' | 'upload' | 'edit' | 'delete';

/** Every switch, on or off. */
export type DrivePermissions = Record<DrivePermission, boolean>;

/** Reading is on unless a project turns it off; anything that writes is opt-in. */
export const DEFAULT_DRIVE_PERMISSIONS = immutable<DrivePermissions>({
    browse: true,
    download: true,
    upload: false,
    edit: false,
    delete: false,
});

/**
 * The switches a project's option leaves in effect: the defaults overridden one by one.
 * @__NO_SIDE_EFFECTS__
 */
export function effectivePermissions(configured?: Partial<DrivePermissions>): DrivePermissions {
    return { ...DEFAULT_DRIVE_PERMISSIONS, ...configured };
}
