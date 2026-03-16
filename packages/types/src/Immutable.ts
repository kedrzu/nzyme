// this is a dummy import just to make it an external module
// it's required to global scope to be working

import type { Item } from './Common.js';

/** Recursively makes T deeply readonly - arrays become readonly arrays, objects get readonly properties. */
export type Immutable<T> = T extends string
    ? T // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    : T extends Function
      ? T // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : T extends any[]
        ? ImmutableArray<Item<T>> // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : T extends ArrayLike<any>
          ? ImmutableArrayLike<Item<T>>
          : T extends Record<string, unknown>
            ? ImmutableObject<T>
            : T;

/** Unwraps an Immutable type back to its mutable form. */
export type Mutable<T> = T extends Immutable<infer V> ? V : T;

type ImmutableObject<T extends Record<string, unknown>> = {
    readonly [P in keyof T]: Immutable<T[P]>;
};

interface ImmutableArrayLike<T> {
    readonly length: number;
    readonly [n: number]: Immutable<T>;
}

type ImmutableArray<T> = readonly Immutable<T>[];
