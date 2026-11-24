import path from 'node:path';

/**
 * The path from `from` to `to` as {@link path.relative} computes it, with the host separator
 * replaced by `/` — the root-relative form paths are compared and stored in.
 *
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function relativePosixPath(from: string, to: string): string {
    return path.relative(from, to).split(path.sep).join('/');
}
