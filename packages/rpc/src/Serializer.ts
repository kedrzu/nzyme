import { HttpError } from '@nzyme/fetch-utils';
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
    serialize(value: unknown): string;
    /**
     *
     */
    deserialize(value: string): unknown;
}

/**
 *
 */
export const defaultSerializer: Serializer = {
    deserialize: parseJson,
    serialize: toJsonString,
};

/**
 *
 */
function parseJson(input: string | null | undefined): unknown {
    if (input == null) {
        return null;
    }

    try {
        return JSON.parse(input);
    } catch {
        throw new HttpError(400, 'Invalid JSON');
    }
}
