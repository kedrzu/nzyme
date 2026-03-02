import type { Primitive } from '@nzyme/types/Common.js';
import { identity } from '@nzyme/utils/functions/identity.js';

import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';

/**
 * Schema type for enum values.
 * @template O - Enum schema options type
 */
export type EnumSchema<O extends SchemaOptionsBase<EnumOptions> = SchemaOptionsBase<EnumOptions>> = Schema<
    EnumValue<O['values']>,
    O
> & {
    /**
     *
     */
    values: O['values'];
};

/**
 * Options for defining an enum schema.
 * @template V - Array of primitive values that form the enum
 */
export type EnumOptions<V extends Primitive[] = Primitive[]> = {
    /** Array of allowed primitive values */
    values: V;
};

/**
 * Value type for enum schema.
 * @template V - Array of primitive values
 */
export type EnumValue<V extends Primitive[]> = V[number];

/**
 * Base type for enum schema definition.
 * Provides overloads for creating enum schemas with different options.
 */
type EnumSchemaConstructor = {
    /** Creates an enum schema with custom options */
    <
        const V extends Primitive[],
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<V[number], TNullable, TOptional, TMeta, EnumOptions<V>>,
    ): EnumSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, EnumOptions<V>>>;

    /** Creates an enum schema with array of values */
    <const V extends Primitive[]>(values: V): EnumSchema<{ values: V }>;
};

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
export const enumSchema = defineSchema<EnumSchemaConstructor, SchemaOptionsBase<EnumOptions>>({
    name: 'enum',
    options: (optionsOrValues: EnumOptions | Primitive[]) => {
        const options: SchemaOptionsBase<EnumOptions> = Array.isArray(optionsOrValues)
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
