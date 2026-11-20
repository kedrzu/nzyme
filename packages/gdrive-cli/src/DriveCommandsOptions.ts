import type { GoogleAuthOptions } from '@nzyme/google-auth/GoogleAuthOptions.js';
import type { GoogleCommandParams } from '@nzyme/google-auth/GoogleCommandParams.js';

import type { DrivePermissions } from './permissions.js';

/** Local files the Drive commands read and write. Every path is absolute or starts with `~`. */
export interface DriveFilesOptions {
    /** Directories, besides the project's, that uploads may read from and downloads may write to. */
    roots?: string[];
    /** Where `download` writes by default. Default `<tmpdir>/gdrive-cli/downloads`. */
    downloadsDir?: string;
}

/** Options of {@link defineDriveCommands}. */
export interface DriveCommandsOptions {
    /** The command path prefix, space-separated. Default `drive`. */
    prefix?: string;
    /** The OAuth client, the secret stores holding the tokens, and the accounts the project may use. */
    auth: GoogleAuthOptions;
    /**
     * What the agent may do; a command whose switch is off is not registered. Default: `browse` and
     * `download` on, `upload`, `edit` and `delete` (trash and restore) off.
     */
    permissions?: Partial<DrivePermissions>;
    files?: DriveFilesOptions;
}

/** What every Drive command is defined with: the Google sign-in params plus the Drive options. */
export interface DriveCommandParams extends GoogleCommandParams {
    files?: DriveFilesOptions;
}
