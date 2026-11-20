import * as path from 'node:path';

/**
 * Whether a path is absolute or home-relative (`~`, `~/…`): the form a configured directory must take
 * when the working directory of the process says nothing about where it should be.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isAbsoluteOrHomePath(dir: string): boolean {
    return path.isAbsolute(dir) || dir === '~' || dir.startsWith('~/');
}
