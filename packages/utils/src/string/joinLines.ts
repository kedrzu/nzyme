/**
 * Join lines into a single string.
 * @util
 * @param lines - Lines to join.
 * @returns Joined lines.
 * @__NO_SIDE_EFFECTS__
 */
export function joinLines(lines: string | string[] | null | undefined) {
    if (!lines) {
        return '';
    }

    return Array.isArray(lines) ? lines.join('\n') : lines;
}
