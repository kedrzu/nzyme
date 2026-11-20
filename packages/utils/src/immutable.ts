import type { Immutable } from '@nzyme/types/Immutable.js';

/**
 * Types a value as deeply immutable, inferring the type instead of spelling it out — the short form
 * of `const X: Immutable<…> = …` for a module constant. Type-level only: the value is returned as it
 * is, never frozen or copied.
 *
 * Literals are not narrowed (no `const` type parameter): `immutable(['a', 'b'])` is a
 * `readonly string[]`, as the plain literal would be, so `.includes(someString)` still type-checks.
 * Reach for `as const` when the literal types are the point, or pass the type explicitly
 * (`immutable<Record<Key, Value>>({ … })`) to check the value against it.
 *
 * Free in a production bundle: Rollup (Vite's build, `compileFunction`) drops an unused constant built
 * with it, and terser and esbuild's minifier inline the call. Bun.build and an unminified esbuild bundle
 * keep both the call and an unused constant: neither reads `@__NO_SIDE_EFFECTS__` across files.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function immutable<T>(value: T): Immutable<T> {
    // `Immutable<T>` only adds `readonly` modifiers, so the value already is one; TypeScript cannot
    // see that through the conditional type of an unresolved `T`.
    return value as Immutable<T>;
}
