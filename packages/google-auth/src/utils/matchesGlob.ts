/**
 * Whether `value` matches `pattern`, where `*` stands for any run of characters; case-insensitive.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function matchesGlob(value: string, pattern: string) {
    const source = pattern
        .split('*')
        .map(part => part.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`))
        .join('.*');
    return new RegExp(`^${source}$`, 'i').test(value);
}
