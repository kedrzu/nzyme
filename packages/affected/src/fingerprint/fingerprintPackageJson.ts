import { getMd5Hash } from '@nzyme/crypto';
import { immutable } from '@nzyme/utils/immutable.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** The `package.json` fields {@link fingerprintPackageJson} leaves out. */
const DROPPED_FIELDS: readonly string[] = immutable([
    'version',
    'scripts',
    'description',
    'keywords',
    'files',
    'publishConfig',
    'repository',
    'license',
    'author',
    'contributors',
    'homepage',
    'bugs',
    'funding',
    'private',
    'devDependencies',
]);

/**
 * Fingerprints the part of a `package.json` that decides what its package's code loads and how it
 * runs, or returns `null` when `content` is not a JSON object. Test selection compares a manifest by
 * this fingerprint where it stands for its package (the manifest of the files a test depends on, a
 * change in the base diff); code that reads the manifest itself (imports it, reads it through `fs`)
 * and a full-run trigger hold it whole.
 *
 * Dropped, because module resolution does not follow from them: `version` (a release bump rewrites
 * it in every package), `scripts` (a script that launches a suite belongs among its full-run
 * triggers), `devDependencies` (what they install is in `bun.lock`, and code importing a new one
 * changes too), `private`, and the publishing metadata — `description`, `keywords`, `files`,
 * `publishConfig`, `repository`, `license`, `author`, `contributors`, `homepage`, `bugs`, `funding`.
 *
 * Everything else counts, a field unknown here included: `exports`, `imports`, `main`, `module`,
 * `types`, `type`, `sideEffects`, `browser`, `bin`, `engines`, the dependency fields, workspace config.
 * Top-level fields are hashed in sorted order, as their order means nothing; nested values keep
 * theirs, as the order of `exports` conditions decides which one matches.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintPackageJson(content: string): string | null {
    let manifest: unknown;
    try {
        manifest = JSON.parse(content);
    } catch {
        return null;
    }
    if (!isPlainObject(manifest)) {
        return null;
    }

    const kept = Object.entries(manifest)
        .filter(([field]) => !DROPPED_FIELDS.includes(field))
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return getMd5Hash(JSON.stringify(kept));
}
