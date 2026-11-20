// What a project lets an agent do in Drive: five switches, each covering a set of commands.
//
// The OAuth scope is the full `drive` scope, because one token serves every project that uses the
// account. The switches are enforced by `defineDriveCommands` instead: a command whose permission is
// off is never registered.

/** The Drive permission switches. */
export const DRIVE_PERMISSIONS = ['browse', 'download', 'upload', 'edit', 'delete'] as const;

/** One Drive permission switch. */
export type DrivePermission = (typeof DRIVE_PERMISSIONS)[number];

/** Every switch, on or off. */
export type DrivePermissions = Record<DrivePermission, boolean>;

/** Reading is on unless a project turns it off; anything that writes is opt-in. */
export const DEFAULT_DRIVE_PERMISSIONS: DrivePermissions = {
    browse: true,
    download: true,
    upload: false,
    edit: false,
    delete: false,
};

/**
 * The switches a project's option leaves in effect: the defaults overridden one by one.
 * @__NO_SIDE_EFFECTS__
 */
export function effectivePermissions(configured?: Partial<DrivePermissions>): DrivePermissions {
    return { ...DEFAULT_DRIVE_PERMISSIONS, ...configured };
}

/**
 * The problems of a `permissions` option: unknown switches and values other than `true`/`false`. The
 * option is typed, but a project may build it from plain config.
 * @__NO_SIDE_EFFECTS__
 */
export function validatePermissions(raw: unknown): string[] {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return [`permissions: expected an object of ${DRIVE_PERMISSIONS.join(', ')} set to true or false`];
    }

    const known: readonly string[] = DRIVE_PERMISSIONS;
    const problems: string[] = [];
    for (const [key, value] of Object.entries(raw)) {
        if (!known.includes(key)) {
            problems.push(`permissions: '${key}' is unknown (known: ${DRIVE_PERMISSIONS.join(', ')})`);
        } else if (typeof value !== 'boolean') {
            problems.push(`permissions: '${key}' must be true or false`);
        }
    }

    return problems;
}
