import type { DateTimeISO } from '@nzyme/types';
import { toJsonString } from '@nzyme/utils';

/**
 *
 */
export type BigIntString = `${bigint}`;

/**
 *
 */
export type Serialized<T> = T extends Date
    ? DateTimeISO
    : T extends bigint
      ? BigIntString
      : T extends Set<infer U>
        ? Array<Serialized<U>>
        : T extends Map<infer K, infer V>
          ? Array<[Serialized<K>, Serialized<V>]>
          : T extends Array<infer U>
            ? Array<Serialized<U>>
            : T extends object
              ? { [K in keyof T]: Serialized<T[K]> }
              : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                T extends Function
                ? never
                : T;

/**
 *
 */
export interface Serializer {
    /**
     *
     */
    (value: unknown): string;
}

/**
 *
 */
export const defaultSerializer: Serializer = toJsonString;
