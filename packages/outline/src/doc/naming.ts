/**
 * A file or folder name for a title: lowercase ASCII words joined by hyphens, Polish letters
 * transliterated. Titles that leave nothing (emoji only, punctuation) get `fallback`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function slugify(title: string, fallback = 'untitled'): string {
    const slug = title
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug === '' ? fallback : slug;
}

/**
 * The first free name among `name`, `name-2`, `name-3`… given the names already in the folder.
 * Comparison ignores case because macOS folders do. `extension` (e.g. `.md`) is appended to each
 * candidate before the check and included in the result. Called only for new files: the sync
 * never renames an existing one.
 * @__NO_SIDE_EFFECTS__
 */
export function pickFreeName(name: string, taken: Iterable<string>, extension = ''): string {
    const takenLower = new Set(Array.from(taken, entry => entry.toLowerCase()));
    for (let attempt = 1; ; attempt++) {
        const candidate = `${attempt === 1 ? name : `${name}-${attempt}`}${extension}`;
        if (!takenLower.has(candidate.toLowerCase())) {
            return candidate;
        }
    }
}
