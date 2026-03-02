import { isIterable } from '@nzyme/utils/array/isIterable.js';

import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaAny,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

/**
 * Options for defining an array schema.
 * @template T - The type of schema for array elements
 */
export type ArrayOptions<T extends SchemaAny = SchemaAny> = {
    /** Schema that defines the type of array elements */
    of: T;
};

/**
 * Schema type for arrays.
 * @template O - Array schema options type
 */
export type ArraySchema<O extends SchemaOptionsBase<ArrayOptions> = SchemaOptionsBase<ArrayOptions>> = Schema<
    Infer<O['of']>[],
    O
> & {
    /**
     *
     */
    of: O['of'];
};

/**
 * Base type for array schema definition.
 */
type ArraySchemaConstructor = {
    /** Creates an array schema with a schema for items */
    <S extends SchemaAny>(of: S): ArraySchema<{ of: S }>;

    /** Creates an array schema with custom options */
    <
        S extends SchemaAny,
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<Infer<S>[], TNullable, TOptional, TMeta, ArrayOptions<S>>,
    ): ArraySchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, ArrayOptions<S>>>;
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
export const array = defineSchema<ArraySchemaConstructor, SchemaOptionsBase<ArrayOptions>>({
    name: 'array',
    options: (optionsOrSchema: ArrayOptions | SchemaAny) => {
        const options: SchemaOptionsBase<ArrayOptions> = isSchema(optionsOrSchema)
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
