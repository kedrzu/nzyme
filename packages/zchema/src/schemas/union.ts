import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';
import { serialize } from '../utils/serialize.js';

/**
 * Options for defining a union schema.
 * @template T - Array of schemas that form the union
 */
export type UnionOptions<T extends Schema[] = Schema[]> = {
    /** Array of schemas that form the union */
    of: T;
};

/**
 * Schema type for union values.
 * @template O - Union schema options type
 */
export type UnionSchema<O extends SchemaOptionsBase<UnionOptions> = SchemaOptionsBase<UnionOptions>> = Schema<
    UnionValue<O>,
    O
> & {
    /** Array of member schemas that form this union */
    of: O['of'];
};

/**
 * Inferred value type for a union schema, which is the union of all member schema values.
 */
export type UnionValue<O extends UnionOptions> = Infer<O['of'][number]>;

/**
 * Base type for union schema definition.
 */
type UnionSchemaConstructor = {
    /** Creates a union schema with an array of schemas */
    <S extends Schema[]>(of: S): UnionSchema<{ of: S }>;

    /** Creates a union schema with custom options */
    <
        S extends Schema[],
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<Infer<S[number]>, TNullable, TOptional, TMeta, UnionOptions<S>>,
    ): UnionSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, UnionOptions<S>>>;
};

/**
 * Creates a schema for union values.
 * This schema validates that a value conforms to at least one of the provided schemas.
 *
 * @example
 * ```ts
 * const stringOrNumber = union([string(), number()]);
 * const booleanOrNull = union([boolean(), null()]);
 * const complexUnion = union({
 *   of: [string(), number(), boolean()],
 *   default: () => 'default'
 * });
 * ```
 */
export const union = defineSchema<UnionSchemaConstructor, SchemaOptionsBase<UnionOptions>>({
    name: 'union',
    options: (optionsOrSchema: Schema[] | UnionOptions) => {
        // TODO: check if there are no multi objects or arrays
        const options: SchemaOptionsBase<UnionOptions> = Array.isArray(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const schemas = options.of;

        const proto: SchemaProto<unknown> = {
            coerce(value, ctx) {
                for (const schema of schemas) {
                    const result = schema.proto.coerce(value, ctx);
                    if (result !== undefined) {
                        return result;
                    }
                }
            },
            serialize(value, ctx) {
                for (const schema of schemas) {
                    if (!schema.proto.check(value, ctx)) {
                        continue;
                    }

                    return serialize(schema, value, ctx);
                }
            },
            check(value, ctx): value is unknown {
                for (const schema of schemas) {
                    if (schema.proto.check(value, ctx)) {
                        return true;
                    }
                }

                return false;
            },
            default: () => [],
            visit(value, visitor, ctx) {
                for (const schema of schemas) {
                    if (!schema.proto.check(value, ctx)) {
                        continue;
                    }

                    schema.proto.visit?.(value, visitor, ctx);
                }
            },
        };

        return proto;
    },
});
