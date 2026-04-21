import type { Merge } from './Common.js';

/** Makes properties optional when their type includes undefined. */
export type PartialOnUndefined<T> = PartialOn<T, undefined>;

/**
 * Makes properties optional when their value type includes TOn.
 */
export type PartialOn<T, TOn> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | (T extends Record<any, any>
          ? { [K in keyof T as TOn extends T[K] ? K : never]?: T[K] } extends infer U // Make a partial type with all value types accepting undefined (and set them optional)
              ? Merge<
                    {
                        [KeyType in keyof T as KeyType extends keyof U ? never : KeyType]: T[KeyType];
                    },
                    U
                > // Join all remaining keys not treated in U
              : never // Should not happen
          : never)
    | T;
