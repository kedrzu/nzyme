/**
 * Get a string of CLI flags from a record of flags
 * @param flags - The record of flags
 * @returns A string of CLI flags
 */
export function getCliFlagString(flags: Record<string, boolean | number | string | undefined>): string {
    return Object.entries(flags)
        .filter(([, value]) => value !== undefined && value !== false)
        .map(([key, value]) => {
            if (value === true) {
                return `--${key}`;
            }

            if (typeof value === 'string') {
                const escaped = value
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\$/g, '\\$')
                    .replace(/`/g, '\\`');
                return `--${key} "${escaped}"`;
            }

            return `--${key} ${value}`;
        })
        .join(' ');
}
