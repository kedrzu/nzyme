/**
 * Trims a path given on the command line and refuses an empty one or one starting with `~`, which a
 * shell would have expanded: a literal `~` means the caller quoted it, and guessing would be wrong.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function checkPathInput(input: string): string {
    const p = input.trim();
    if (!p) {
        throw new Error('Empty file path');
    }

    if (p.startsWith('~')) {
        throw new Error(`'${p}': use an absolute path instead of ~`);
    }

    return p;
}
