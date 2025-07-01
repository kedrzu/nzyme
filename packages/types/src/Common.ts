/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Flatten } from './Object.js';

/**
 *
 */
export type NonPartial<T> = { [P in keyof T]-?: T[P] };

/**
 *
 */
export type Primitive = bigint | boolean | number | string;

/**
 *
 */
export type Strict<T> = Exclude<T, null | undefined>;

/**
 *
 */
export type Defined<T> = Exclude<T, undefined>;
/**
 *
 */
export type Simplify<T> = Exclude<T, undefined>;

/**
 *
 */
export type PropertyNames<T> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

/** Only properties of the object, without functions */
export type Properties<T> = {
    [K in PropertyNames<T>]: T[K];
};

/**
 *
 */
export type FlattenUnion<T> = T extends any ? Flatten<T> : never;

/**
 *
 */
export type Merge<T1, T2> = Exclude<
    {
        [K in keyof (T1 & T2)]: (T1 & T2)[K];
    },
    undefined
>;

/**
 *
 */
export type Override<T1, T2> = {
    [K in keyof T1 | keyof T2]: K extends keyof T2 ? T2[K] : K extends keyof T1 ? T1[K] : never;
};

/**
 *
 */
export type Maybe<T> = T | null | undefined;

/**
 *
 */
export type Item<T> = T extends Iterable<infer U> ? U : T[keyof T];

/**
 *
 */
export type Writable<T> = { -readonly [P in keyof T]: T[P] };

/**
 *
 */
export type Getter<T> = () => T;

/**
 *
 */
export type ValueOf<T> = Exclude<T[keyof T], undefined>;

/**
 *
 */
export type RecordToUnion<T extends Record<string, any>> = T[keyof T];

/**
 *
 */
export type Func<A extends any[] = any[], T = void> = (...args: A) => T;

/**
 *
 */
export type StringNonLiteral = string & {};
