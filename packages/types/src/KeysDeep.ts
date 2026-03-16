import type { Simplify } from './Common.js';

/** Recursively extracts all nested property key paths from T using dot notation. */
export type KeysDeep<T extends Record<number | string, unknown>> = Simplify<
    | {
          [K in keyof T]: K extends number | string ? KeysWithPrefix<K, T> : never;
      }[keyof T]
    | keyof T
>;

type KeysWithPrefix<P extends number | string, T> = {
    [K in keyof T]: K extends number | string
        ? T[K] extends Record<string, unknown>
            ? KeysWithPrefix<`${P}.${K}`, T[K]> | `${P}.${K}`
            : `${P}.${K}`
        : never;
}[keyof T];
