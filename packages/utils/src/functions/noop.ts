/**
 * A function that does nothing. It can be called with any arguments and returns undefined.
 *
 * @param args - Any arguments (ignored)
 * @returns
 */
// #__NO_SIDE_EFFECTS__
export function noop(...args: unknown[]): void;
export function noop(...args: unknown[]): undefined;
export function noop(): undefined {}
