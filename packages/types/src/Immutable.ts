// this is a dummy import just to make it an external module
// it's required to global scope to be working

import type { Item } from './Common.js';

/**
 * Recursively makes T deeply readonly: arrays become readonly arrays, `Map`/`Set` their readonly
 * interfaces, and every other object — an interface as much as a type alias — gets readonly
 * properties all the way down. Primitives and functions are kept as they are.
 */
export type Immutable<T> = T extends string
    ? T // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    : T extends Function
      ? T
      : T extends ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<Immutable<K>, Immutable<V>>
        : T extends ReadonlySet<infer V>
          ? ReadonlySet<Immutable<V>> // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : T extends readonly any[]
            ? ImmutableArray<Item<T>> // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : T extends ArrayLike<any>
              ? ImmutableArrayLike<Item<T>>
              : T extends object
                ? ImmutableObject<T>
                : T;

/** Unwraps an Immutable type back to its mutable form. */
export type Mutable<T> = T extends Immutable<infer V> ? V : T;

type ImmutableObject<T extends object> = {
    readonly [P in keyof T]: Immutable<T[P]>;
};

interface ImmutableArrayLike<T> {
    readonly length: number;
    readonly [n: number]: Immutable<T>;
}

type ImmutableArray<T> = readonly Immutable<T>[];
