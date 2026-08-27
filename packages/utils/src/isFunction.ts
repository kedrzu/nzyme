/** Any callable value, written so it accepts every function shape without widening to `Function`. */
type AnyFunction = (...args: never[]) => unknown;

/**
 * Checks whether a value is callable.
 *
 * Prefer this over `value instanceof Function`, which only holds for functions created in the same
 * JS realm — it silently returns `false` for one that crossed a `node:vm` context, a worker or an
 * iframe. Prefer it over a bare `typeof value === 'function'` too: on a union this narrows to the
 * union's callable members instead of intersecting the whole union with `Function`.
 * @util
 *
 * @param value - The value to check
 * @returns True if the value is callable
 *
 * @example
 * ```typescript
 * isFunction(() => {}); // true
 * isFunction('not a function'); // false
 *
 * declare const x: (() => number) | string;
 * if (isFunction(x)) {
 *     x(); // narrowed to `() => number`
 * }
 * ```
 */
export function isFunction<T>(value: T): value is Extract<T, AnyFunction> {
    return typeof value === 'function';
}
