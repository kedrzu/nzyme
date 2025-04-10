import type { Primitive } from '@nzyme/types';
import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Options for defining an enum schema.
 * @template V - Array of primitive values that form the enum
 */
export type EnumSchemaOptions<V extends Primitive[] = Primitive[]> = SchemaOptions<V[number]> & {
    /** Array of allowed primitive values */
    values: V;
};

/**
 * Schema type for enum values.
 * @template O - Enum schema options type
 */
export type EnumSchema<O extends EnumSchemaOptions = EnumSchemaOptions> = ForceName<
    Schema<O['values'][number], O>
>;

// Helper type to force type name preservation
declare class FF {}
type ForceName<T> = T & FF;

/**
 * Value type for enum schema.
 * @template O - Enum schema options type
 */
export type EnumSchemaValue<O extends EnumSchemaOptions> = O['values'][number];

/**
 * Base type for enum schema definition.
 */
type EnumSchemaBase = {
    /** Creates an enum schema with custom options */
    <const V extends Primitive[], O extends EnumSchemaOptions<V>>(
        options: O & EnumSchemaOptions<V>,
    ): EnumSchema<SchemaOptionsSimlify<O>>;
    /** Creates an enum schema with array of values */
    <const V extends Primitive[]>(values: V): EnumSchema<{ values: V }>;
};

/**
 * Creates a schema for enum values.
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
