import { toJsonString } from '@nzyme/utils';
import type { Infer, Schema } from '@nzyme/zchema';
import { coerce, parseJson } from '@nzyme/zchema';

import { storageRef } from './storageRef.js';
import type { StorageRefOptions } from './storageRef.js';

/**
 * Configuration options for creating a storage ref with schema validation.
 *
 * @template T The type of value to be stored, inferred from the schema
 */
export interface StorageRefWithSchemaOptions<S extends Schema>
    extends Omit<StorageRefOptions, 'deserialize' | 'serialize'> {
    /**
     * Schema used to validate and parse the stored data.
     * The schema ensures type safety and data integrity when reading from
     * and writing to storage.
     */
    schema: S;
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
export function storageRefWithSchema<S extends Schema>(options: StorageRefWithSchemaOptions<S>) {
    return storageRef<Infer<S>>({
        ...options,
        serialize: value => toJsonString(value),
        deserialize: value => parseJson(options.schema, value),
        default: () => coerce(options.schema, null),
    });
}
