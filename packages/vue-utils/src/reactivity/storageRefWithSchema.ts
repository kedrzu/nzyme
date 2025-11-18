import type { StandardSchemaV1 } from '@standard-schema/spec';

import { toJsonString } from '@nzyme/utils';

import { storageRef } from './storageRef.js';
import type { StorageRefOptions } from './storageRef.js';

/**
 * Configuration options for creating a storage ref with schema validation.
 *
 * @template T The type of value to be stored, inferred from the schema
 */
export interface StorageRefWithSchemaOptions<T> extends Omit<StorageRefOptions, 'deserialize' | 'serialize'> {
    /**
     * Schema used to validate and parse the stored data.
     * The schema ensures type safety and data integrity when reading from
     * and writing to storage.
     */
    schema: StandardSchemaV1<unknown, T>;

    /**
     * Default value to use when no value is stored in storage.
     */
    default: () => T;
}

/**
 * Creates a storage ref with schema validation using schema.
 * This ensures that data read from and written to storage always matches
 * the expected schema, providing type safety and data integrity.
 *
 * @template T The type of value to be stored, inferred from the schema
 * @param options Standard storage ref options
 * @returns A storage ref that validates data against the schema
 *
 * @example
 * ```ts
 * import { object, string, number } from '@nzyme/zchema';
 *
 * const userSchema = object({
 *   name: string(),
 *   age: number().min(0),
 *   email: string().email()
 * });
 *
 * const userRef = storageRefWithSchema({
 *   key: 'user-data',
 *   storage: 'local',
 *   schema: userSchema
 * });
 *
 * // Type-safe and validated
 * userRef.value = {
 *   name: 'John',
 *   age: 25,
 *   email: 'john@example.com'
 * };
 * ```
 */
export function storageRefWithSchema<T>(options: StorageRefWithSchemaOptions<T>) {
    return storageRef<T>({
        ...options,
        serialize: value => toJsonString(value),
        deserialize: value => {
            try {
                const json = JSON.parse(value);
                const result = options.schema['~standard'].validate(json);
                if (result instanceof Promise) {
                    return options.default();
                }

                if (result.issues) {
                    return options.default();
                }

                return result.value;
            } catch {
                return options.default();
            }
        },
        default: options.default,
    });
}
