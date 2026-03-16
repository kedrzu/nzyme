/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Flatten } from './Object.js';

/** Makes all properties of T required, removing optional modifiers. */
export type NonPartial<T> = { [P in keyof T]-?: T[P] };

/** JavaScript primitive value types (excludes symbol and undefined). */
export type Primitive = bigint | boolean | number | string;

/** Excludes null and undefined from T, ensuring a strict non-nullable type. */
export type Strict<T> = Exclude<T, null | undefined>;

/** Excludes undefined from T, allowing null but not undefined. */
export type Defined<T> = Exclude<T, undefined>;

/** Alias for Defined - excludes undefined from the type. */
export type Simplify<T> = Exclude<T, undefined>;

/** Extracts only non-function property names from T. */
export type PropertyNames<T> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

/** Only properties of the object, without functions */
export type Properties<T> = {
    [K in PropertyNames<T>]: T[K];
};

/** Distributes Flatten across union members of T. */
export type FlattenUnion<T> = T extends any ? Flatten<T> : never;

/** Merges two types into a flat intersection, excluding undefined. */
export type Merge<T1, T2> = Exclude<
    {
        [K in keyof (T1 & T2)]: (T1 & T2)[K];
    },
    undefined
>;

/** Combines T1 and T2 where T2's properties take precedence over T1's. */
export type Override<T1, T2> = {
    [K in keyof T1 | keyof T2]: K extends keyof T2 ? T2[K] : K extends keyof T1 ? T1[K] : never;
};

/** Represents a value that may be null or undefined. */
export type Maybe<T> = T | null | undefined;

/** Extracts the element type from an iterable or the value type from an indexable object. */
export type Item<T> = T extends Iterable<infer U> ? U : T[keyof T];

/** Removes readonly from arrays and object properties of T. */
export type Writable<T> = T extends readonly (infer U)[] ? U[] : { -readonly [P in keyof T]: T[P] };

/** A zero-argument function that returns T. */
export type Getter<T> = () => T;

/** Extracts all defined value types from T's properties. */
export type ValueOf<T> = Exclude<T[keyof T], undefined>;

/** Extracts the union of all value types from a record type. */
export type RecordToUnion<T extends Record<string, any>> = T[keyof T];

/** Generic function type with configurable argument list and return type. */
export type Func<A extends any[] = any[], T = void> = (...args: A) => T;

/** A string type that accepts any string value while preserving literal autocompletion. */
export type StringNonLiteral = string & {};

/** UUID string in the standard 8-4-4-4-12 hexadecimal format. */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Represents types that can be compared using relational operators (<, >, <=, >=)
 */
export type Comparable = bigint | number | Date;
