import type { Primitive } from '@nzyme/types';
import { identity } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';

/**
 * Schema type for enum values.
 * @template O - Enum schema options type
 */
export type EnumSchema<O extends EnumSchemaOptions = EnumSchemaOptions> = ForceName<
    Schema<O['values'][number], O>
>;

/**
 * Options for defining an enum schema.
 * @template V - Array of primitive values that form the enum
 */
export type EnumSchemaOptions<V extends Primitive[] = Primitive[]> = SchemaOptions<V[number]> & {
    /** Array of allowed primitive values */
    values: V;
};

/**
 * Value type for enum schema.
 * @template O - Enum schema options type
 */
export type EnumSchemaValue<O extends EnumSchemaOptions> = O['values'][number];

/**
 * Base type for enum schema definition.
 * Provides overloads for creating enum schemas with different options.
 */
type EnumSchemaBase = {
    /** Creates an enum schema with custom options */
    <const V extends Primitive[], O extends EnumSchemaOptions<V>>(
        options: EnumSchemaOptions<V> & O,
    ): EnumSchema<SchemaOptionsSimlify<O>>;
    /** Creates an enum schema with array of values */
    <const V extends Primitive[]>(values: V): EnumSchema<{ values: V }>;
};

/**
 * Helper type to force type name preservation.
 * @template T - The type to preserve
 * @internal
 */
type ForceName<T> = FF & T;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class FF {}

/**
 * Creates a schema for enum values.
 * This schema validates that a value is one of the allowed values in the enum.
 * If a value is not in the enum, it is coerced to the first value in the enum.
 *
 * @example
 * ```ts
 * const colorEnum = enumSchema(['red', 'green', 'blue']);
 * const statusEnum = enumSchema({
 *   values: ['active', 'inactive', 'pending'],
 *   default: () => 'pending'
 * });
 * ```
 */
export const enumSchema = defineSchema<EnumSchemaBase, EnumSchemaOptions>({
    name: 'enum',
    options: (optionsOrValues: EnumSchemaOptions | Primitive[]) => {
        const options: EnumSchemaOptions = Array.isArray(optionsOrValues)
            ? { values: optionsOrValues }
            : optionsOrValues;

        return options;
    },
    proto: options => {
        const values = options.values;
        const valuesSet = new Set(values);

        const proto: SchemaProto<Primitive> = {
            coerce(value) {
                if (valuesSet.has(value as Primitive)) {
                    return value as Primitive;
                }

                return values[0];
            },
            serialize: identity,
            check: value => valuesSet.has(value as Primitive),
            default: () => values[0] as Primitive,
        };

        return proto;
    },
});
