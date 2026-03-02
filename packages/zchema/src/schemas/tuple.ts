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
import { serialize } from '../utils/serialize.js';

/**
 *
 */
export type TupleOptions<T extends Schema[] = Schema[]> = {
    /**
     *
     */
    of: T;
};

/**
 * Schema type for tuple values.
 * @template T - Array of schema types
 * @template O - Schema options type
 */
export type TupleSchema<O extends SchemaOptionsBase<TupleOptions> = SchemaOptionsBase<TupleOptions>> = ForceName &
    Schema<TupleValue<O['of']>, O> & {
        /**
         *
         */
        of: O['of'];
    };

/**
 * Value type for tuple schemas.
 * @template TTuple - Tuple of schema types
 */
export type TupleValue<TTuple extends [...SchemaAny[]]> = {
    [K in keyof TTuple]: Infer<TTuple[K]>;
} & { length: TTuple['length'] };

/**
 * Base type for tuple schema definition.
 */
type TupleSchemaBase = {
    /** Creates a tuple schema with custom options */
    <
        const S extends Schema[],
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<TupleValue<S>, TNullable, TOptional, TMeta, TupleOptions<S>> & SchemaOptionsBase,
    ): TupleSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, TupleOptions<S>>>;

    /** Creates a tuple schema with schemas for elements */
    <const S extends Schema[]>(of: S): TupleSchema<{ of: S }>;
};

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a schema for tuple values.
 * This schema validates arrays with a fixed size and types.
 *
 * @example
 * ```ts
 * const point = tuple([number(), number()]);
 * const rgb = tuple([number(), number(), number()]);
 * const userTuple = tuple([string(), number(), boolean()]);
 * ```
 */
export const tuple = defineSchema<TupleSchemaBase, SchemaOptionsBase<TupleOptions>>({
    name: 'tuple',
    options: (optionsOrSchema: SchemaAny[] | TupleOptions) => {
        const options: SchemaOptionsBase<TupleOptions> = Array.isArray(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const of = options.of;

        const proto: SchemaProto<unknown[]> = {
            coerce(value) {
                const result: unknown[] = [];

                if (value == null) {
                    value = [];
                }

                for (let i = 0; i < of.length; i++) {
                    const item = (value as unknown[])[i];
                    result.push(coerce(of[i]!, item));
                }

                return result;
            },
            serialize(value) {
                const result: unknown[] = [];

                for (let i = 0; i < of.length; i++) {
                    result.push(serialize(of[i]!, value[i]));
                }

                return result;
            },
            check(value): value is unknown[] {
                return Array.isArray(value) && value.length === of.length;
            },
            default: () => [],
            visit(value, visitor) {
                for (let i = 0; i < of.length; i++) {
                    visitor(of[i]!, value[i], i);
                }
            },
        };

        return proto;
    },
});
