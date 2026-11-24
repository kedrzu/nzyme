/** The property a function wrapped by `installFsTrace` answers `true` to. */
export const FS_TRACED = Symbol.for('nzyme.fsTraced');

/**
 * Whether `fn` is a function `installFsTrace` wrapped. A test runner's own test can check it on a named
 * import (`import { readFileSync } from 'node:fs'`): the preload reaches named imports only when it
 * loads before anything imports `node:fs`, and nothing else would notice that it does not.
 * @__NO_SIDE_EFFECTS__
 */
export function isFsTraced(fn: unknown): boolean {
    return typeof fn === 'function' && Reflect.get(fn, FS_TRACED) === true;
}
