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
import type { Extend } from '../utils/extend.js';

/**
 * Options type for lazy schema.
 * @template T - Schema type
 */
export type LazyOptions<T extends Schema = Schema> = {
    /**
     * Function that returns the schema to be lazily evaluated
     */
    of: () => T;
};

/**
 * Schema type for lazy-loaded schema values.
 * @template O - Schema options type
 */
export type LazySchema<O extends SchemaOptionsBase<LazyOptions> = SchemaOptionsBase<LazyOptions>> = ForceName &
    Schema<LazyValue<O>, O> & {
        /**
         * Function that returns the inner schema
         */
        of: () => Schema;
    };

/**
 * Helper type to extract the underlying value type from a lazy schema.
 * @template O - Lazy schema options
 */
export type LazyValue<O extends SchemaOptionsBase<LazyOptions>> =
    O extends SchemaOptionsBase<LazyOptions<infer T extends Schema>> ? Infer<T> : never;

/**
 * Type representing the resolved lazy schema.
 * @template S - Lazy schema type
 */
export type LazySchemaResolved<S extends LazySchema> =
    S extends LazySchema<infer O extends SchemaOptionsBase<LazyOptions>>
        ? Extend<LazySchemaInner<S>, Omit<O, 'proto' | 'type'>>
        : never;

/**
 * Type representing the inner schema type of a lazy schema.
 * @template S - Lazy schema type
 */
export type LazySchemaInner<S extends LazySchema> =
    S extends LazySchema<infer O extends SchemaOptionsBase<LazyOptions>> ? ReturnType<O['of']> : never;

/**
 * Base type for lazy schema definition.
 */
type LazySchemaConstructor = {
    /** Creates a lazy schema with a schema factory function */
    <S extends Schema>(of: () => S): LazySchema<SchemaOptionsBase<LazyOptions<S>>>;

    /** Creates a lazy schema with custom options */
    <
        S extends Schema,
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<Infer<S>, TNullable, TOptional, TMeta, LazyOptions<S>>,
    ): LazySchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, LazyOptions<S>>>;
};

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Prototype implementation for lazy schema.
 */
const lazyProto: SchemaProto<unknown> = {
    coerce: lazyThrow,
    serialize: lazyThrow,
    check: lazyThrow,
    default: lazyThrow,
    visit: lazyThrow,
};

/**
 * Creates a schema that lazily resolves another schema.
 * Use this when you need to refer to a schema that hasn't been defined yet,
 * or to break circular dependencies in schema definitions.
 *
 * @example
 * ```ts
 * // Breaking circular references
 * const personSchema = z.object({
 *   props: {
 *     name: z.string(),
 *     friends: z.array({ of: z.lazy(() => personSchema) })
 *   }
 * });
 *
 * // Using with options
 * const lazySchema = z.lazy({
 *   of: () => z.string(),
 *   nullable: true
 * });
 * ```
 */
export const lazy = defineSchema<LazySchemaConstructor, SchemaOptionsBase<LazyOptions>>({
    name: 'lazy',
    options: (optionsOrSchema: (() => Schema) | LazyOptions): SchemaOptionsBase<LazyOptions> => {
        if (typeof optionsOrSchema === 'function') {
            return {
                of: lazyWrapper(optionsOrSchema),
            };
        }

        const options = { ...optionsOrSchema };
        options.of = lazyWrapper(options.of);
        return options;
    },
    proto: () => lazyProto,
});

/**
 * Resolves a lazy schema to its underlying schema.
 * @param schema - Schema to resolve
 * @returns Resolved schema
 */
export function lazyResolve<S extends Schema>(schema: S): S extends LazySchema ? LazySchemaResolved<S> : S;
/** Implementation signature for lazyResolve. */
export function lazyResolve(schema: Schema): Schema {
    if (!isLazySchema(schema)) {
        return schema;
    }

    const unwrapped = schema.of();

    const override: Schema = {
        ...unwrapped,
        ...schema,
        proto: unwrapped.proto,
        type: unwrapped.type,
    };

    Object.assign(schema, override);
    return schema;
}

/**
 * Creates a wrapper for the schema factory function that caches the result.
 * @param of - Schema factory function
 * @returns Wrapped factory function
 * @internal
 */
function lazyWrapper(of: () => Schema) {
    let schema: Schema | undefined;
    return () => {
        if (!schema) {
            schema = of();
        }

        return schema;
    };
}

/**
 * Helper function that throws an error when lazy schema is used before being resolved.
 * @internal
 */
function lazyThrow<T>(): T {
    throw new Error('Resolve lazy schema before first use');
}

/**
 * Checks if a schema is a lazy schema.
 * @param schema - Schema to check
 * @returns Whether the schema is a lazy schema
 * @internal
 */
function isLazySchema(schema: Schema): schema is LazySchema {
    return schema.type === lazy;
}
