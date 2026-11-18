import { getMd5Hash } from '@nzyme/crypto';
import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import { getImportSourceKind } from '@nzyme/project-utils/importGraph/extractImportSpecifiers.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

/**
 * A set of walked files a variant depends on as a set — its inputs nothing imports, so a file
 * appearing in it or leaving it is a change too:
 * - `package` — the files of the workspace package at `dir` with no import source kind (fixtures,
 *   data, templates; `getImportSourceKind`) that no `ignore` glob matches: what a test reads through
 *   `fs`, which no import shows. The base diff seeds the whole package from such a file the same way;
 * - `directory` — every file under `dir`, the directory of a file with a computed `import(…)`: any
 *   of them may be what it loads.
 */
export interface FileListing {
    kind: 'package' | 'directory';
    /** Root-relative directory; `''` is the root. */
    dir: string;
}

/** What a listing is resolved against: the same at record and at select. */
export interface FileListingContext {
    /** Every walked (non-ignored) root-relative file, sorted. */
    files: readonly string[];
    /** Root-relative directories of the workspace packages. */
    packageDirs: readonly string[];
    /** Whether a root-relative file matches an `ignore` glob of the config. */
    isIgnored: (file: string) => boolean;
}

/**
 * The walked files of a listing, sorted.
 * @__NO_SIDE_EFFECTS__
 */
export function listFiles(listing: FileListing, context: FileListingContext): string[] {
    const prefix = listing.dir === '' ? '' : `${listing.dir}/`;
    const under = context.files.filter(file => file.startsWith(prefix));
    switch (listing.kind) {
        case 'package':
            return under.filter(
                file =>
                    getImportSourceKind(file) === null &&
                    !context.isIgnored(file) &&
                    findOwningPackageDir(file, context.packageDirs) === listing.dir,
            );
        case 'directory':
            return under;
        default:
            return assertNever(listing.kind);
    }
}

/**
 * The key a variant stores a listing's digest under, `<kind>:<dir>`.
 * @__NO_SIDE_EFFECTS__
 */
export function getFileListingKey(listing: FileListing): string {
    return `${listing.kind}:${listing.dir}`;
}

/**
 * The listing a stored key names, or `null` for a key this version does not write.
 * @__NO_SIDE_EFFECTS__
 */
export function parseFileListingKey(key: string): FileListing | null {
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator);
    const dir = key.slice(separator + 1);
    switch (kind) {
        case 'package':
        case 'directory':
            return separator === -1 ? null : { kind, dir };
        default:
            return null;
    }
}

/**
 * The digest of a sorted file list: equal lists, equal digests.
 * @__NO_SIDE_EFFECTS__
 */
export function hashFileList(files: readonly string[]): string {
    return getMd5Hash(JSON.stringify(files));
}
