import type { GoogleAuthOptions } from '@nzyme/google-auth/GoogleAuthOptions.js';

import type { DrivePermissions } from './permissions.js';

/** Options of {@link defineDriveCommands}. */
export interface DriveCommandsOptions {
    /** The command path prefix, space-separated. Default `drive`. */
    prefix?: string;
    /**
     * The secrets provider, the declared token secret, the OAuth client provider, and the accounts the
     * project may use.
     */
    auth: GoogleAuthOptions;
    /**
     * What the agent may do; a command whose switch is off is not registered. Default: `browse` and
     * `download` on, `upload`, `edit` and `delete` (trash and restore) off.
     */
    permissions?: Partial<DrivePermissions>;
}
