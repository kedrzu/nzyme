import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaConfigBase,
    SchemaConfigSimplify,
    SchemaOptions,
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
export type UnionSchema<O extends SchemaConfigBase<UnionOptions> = SchemaConfigBase<UnionOptions>> =
    Schema<UnionValue<O>, O> & {
        /**
         *
         */
        of: O['of'];
    };

/**
 *
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
        TMeta extends object | undefined = undefined,
    >(
        options: SchemaOptions<Infer<S[number]>, TNullable, TOptional, TMeta, UnionOptions<S>>,
    ): UnionSchema<SchemaConfigSimplify<TNullable, TOptional, TMeta, UnionOptions<S>>>;
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
export const union = defineSchema<UnionSchemaConstructor, SchemaConfigBase<UnionOptions>>({
    name: 'union',
    options: (optionsOrSchema: Schema[] | UnionOptions) => {
        // TODO: check if there are no multi objects or arrays
        const options: SchemaConfigBase<UnionOptions> = Array.isArray(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const schemas = options.of;

        const proto: SchemaProto<unknown> = {
            coerce(value) {
                for (const schema of schemas) {
                    const result = schema.proto.coerce(value);
                    if (result !== undefined) {
                        return result;
                    }
                }
            },
            serialize(value) {
                for (const schema of schemas) {
                    if (!schema.proto.check(value)) {
                        continue;
                    }

                    return serialize(schema, value);
                }
            },
            check(value): value is unknown {
                for (const schema of schemas) {
                    if (schema.proto.check(value)) {
                        return true;
                    }
                }

                return false;
            },
            default: () => [],
            visit(value, visitor) {
                for (const schema of schemas) {
                    if (!schema.proto.check(value)) {
                        continue;
                    }

                    schema.proto.visit?.(value, visitor);
                }
            },
        };

        return proto;
    },
});
