/**
 * Get a string of CLI flags from a record of flags
 * @param flags - The record of flags
 * @returns A string of CLI flags
 */
export function getCliFlagString(flags: Record<string, boolean | number | string | undefined>): string {
    return Object.entries(flags)
        .map(([key, value]) => {
            if (typeof value === 'boolean') {
                return `--${key}`;
            }

            return `--${key} ${value}`;
        })
        .join(' ');
}
