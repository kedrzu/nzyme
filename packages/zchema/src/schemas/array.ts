import { isIterable } from '@nzyme/utils';

import type {
    Infer,
    Schema,
    SchemaAny,
    SchemaOptions,
    SchemaOptionsSimlify,
    SchemaProto,
} from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

/**
 * Options for defining an array schema.
 * @template T - The type of schema for array elements
 */
export type ArraySchemaOptions<T extends SchemaAny = SchemaAny> = SchemaOptions<Infer<T>[]> & {
    /** Schema that defines the type of array elements */
    of: T;
    /** Optional function that returns default array value */
    default?: () => Infer<T>[];
};

/**
 * Schema type for arrays.
 * @template O - Array schema options type
 */
export type ArraySchema<O extends ArraySchemaOptions = ArraySchemaOptions> = ForceName<
    O extends ArraySchemaOptions<infer T extends SchemaAny> ? Schema<Infer<T>[], O> : never
>;

// Helper type to force type name preservation
declare class FF {}
type ForceName<T> = T & FF;

/**
 * Value type for array schema.
 * @template O - Array schema options type
 */
export type ArraySchemaValue<O extends ArraySchemaOptions> = Infer<O['of']>[];

/**
 * Base type for array schema definition.
 */
type ArraySchemaBase = {
    <S extends SchemaAny>(of: S): ArraySchema<{ of: S }>;
    <O extends ArraySchemaOptions>(
        options: O & ArraySchemaOptions<O['of']>,
    ): ArraySchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for arrays.
 *
 * @example
 * ```ts
 * const numberArray = array(number());
 * const stringArray = array(string());
 * const customArray = array({
 *   of: number(),
 *   default: () => [1, 2, 3]
 * });
 * ```
 */
export const array = defineSchema<ArraySchemaBase, ArraySchemaOptions>({
    name: 'array',
    options: (optionsOrSchema: SchemaAny | ArraySchemaOptions) => {
        const options: ArraySchemaOptions = isSchema(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const itemSchema = options.of;

        const proto: SchemaProto<unknown[]> = {
            coerce(value) {
                const result: unknown[] = [];

                if (!isIterable(value)) {
                    return result;
                }

                for (const item of value) {
                    result.push(coerce(itemSchema, item));
                }

                return result;
            },
            serialize(value) {
                const result: unknown[] = [];

                for (const item of value) {
                    result.push(serialize(itemSchema, item));
                }

                return result;
            },
            check(value): value is unknown[] {
                return Array.isArray(value);
            },
            default: () => [],
            visit(value, visitor) {
                for (let i = 0; i < value.length; i++) {
                    visitor(itemSchema, value[i], i);
                }
            },
        };

        return proto;
    },
});
