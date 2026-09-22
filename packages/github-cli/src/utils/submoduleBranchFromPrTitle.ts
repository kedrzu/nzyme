import { assertValue } from '@nzyme/utils';

// Same cap `switchToTask.ts` applies to a main-repo branch slug, kept here so a verbose PR title
// (a full sentence, a pasted error message) cannot produce an unwieldy or filesystem-hostile
// branch name. The type prefix is added after capping, mirroring how `switchToTask.ts` adds the
// issue-id prefix outside of its own 50-character cut.
const MAX_SLUG_LENGTH = 50;

const CONVENTIONAL_COMMIT_PATTERN = /^([a-z0-9]+)(?:\([^)]*\))?!?:\s*(.+)$/i;

/**
 * Derive a submodule branch name from a Conventional-Commits-style PR title, e.g.
 * `feat(linear): decouple submodule flow` → `feat/decouple-submodule-flow`.
 *
 * nzyme's own branch convention is `<type>/<slug>` with no scope, no task ID, and no project name
 * — the type comes from the commit type the PR title already declares, so nobody has to type the
 * branch name twice. A title with no recognisable Conventional-Commits type (already a slug,
 * plain prose, ...) still needs a branch name, so it falls back to the bare slug with no prefix
 * rather than failing.
 * @param prTitle The PR title to derive a branch name from.
 * @returns The `<type>/<slug>` branch name, or a bare slug when no type prefix is recognised.
 * @__NO_SIDE_EFFECTS__
 */
export function submoduleBranchFromPrTitle(prTitle: string): string {
    const match = CONVENTIONAL_COMMIT_PATTERN.exec(prTitle);

    if (!match) {
        return slugify(prTitle, MAX_SLUG_LENGTH);
    }

    const [, type, description] = match;
    const slug = slugify(assertValue(description, 'unreachable: capturing group always matches'), MAX_SLUG_LENGTH);
    const normalizedType = assertValue(type, 'unreachable: capturing group always matches').toLowerCase();

    return `${normalizedType}/${slug}`;
}

function slugify(text: string, maxLength: number): string {
    const full = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // Cutting at a fixed length can leave a trailing separator, so trim again afterwards.
    return full.slice(0, maxLength).replace(/-+$/, '');
}
