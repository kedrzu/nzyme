import type { IfAny, IfUnknown, PartialOnUndefined, Simplify } from '@nzyme/types';
import type { Validator } from '@nzyme/validation';

/**
 * Infers the TypeScript type from a schema definition.
 * @template TSchema - The schema type to infer from
 * @returns The inferred type, including null and undefined if the schema allows them
 */
export type Infer<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any>
        ? NullableValue<TSchema['nullable']> | OptionalValue<TSchema['optional']> | V
        : never;

/**
 * Infers the non-nullable TypeScript type from a schema definition.
 * @template TSchema - The schema type to infer from
 * @returns The inferred type, excluding null and undefined
 */
export type InferNonNull<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any> ? V : never;

/**
 * Infers the TypeScript type from a schema or returns a default type.
 * @template TSchema - The schema type to infer from
 * @template T - The default type to return if TSchema is not a schema
 * @returns The inferred type or the default type
 */
export type InferOr<TSchema, T = undefined> = TSchema extends Schema ? Infer<TSchema> : T;

/**
 * Base schema type that defines the structure of all schemas.
 * @template V - The value type that the schema validates
 * @template O - The options type for the schema
 */
export type Schema<
    V = unknown,
    O extends SchemaOptions<V> = SchemaOptions<V>,
> = PartialOnUndefined<{
    [K in Exclude<keyof O, keyof SchemaOptions<V>>]: O[K];
}> &
    SchemaProps<V> & {
        default?: () => V;
        nullable: IfAny<
            O,
            boolean,
            IfUnknown<O['nullable'], false, Exclude<O['nullable'], undefined>>
        >;
        optional: IfAny<
            O,
            boolean,
            IfUnknown<O['optional'], false, Exclude<O['optional'], undefined>>
        >;
        proto: SchemaProto<V, unknown>;
        type: SchemaBase;
        validate: Validator[];
    };

/**
 * Type representing any schema, regardless of its value or options type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaAny = Schema<any, any>;

/**
 * Base type for schema factory functions.
 * @template S - The schema type that the factory creates
 */
export type SchemaBase<S extends Schema = Schema> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): S;
};

/**
 * Type representing a default value for a schema, either as a value or a function that returns a value.
 * @template V - The type of the default value
 */
export type SchemaDefault<V> = (() => V) | V;

/**
 * Creates a schema that matches a given TypeScript type.
 * @template T - The TypeScript type to create a schema for
 */
export type SchemaOf<T> = Schema<
    Exclude<T, null | undefined>,
    {
        /**
         * Whether the schema accepts null values
         */
        nullable: null extends T ? true : false;
        /**
         * Whether the schema accepts undefined values
         */
        optional: undefined extends T ? true : false;
    }
>;

/**
 * Interface for schema options that can be passed to schema factories.
 * @template V - The value type that the schema validates
 */
export interface SchemaOptions<V = unknown> extends SchemaOptionsBase, SchemaProps<V> {
    /**
     * Default value or function for the schema
     */
    default?: SchemaDefault<V>;
    /**
     * Array of validators to apply to values
     */
    validate?: Validator<V> | Validator<V>[];
}

/**
 * Type representing any schema options, regardless of value type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsAny = SchemaOptions<any>;

/**
 * Base interface for schema options that define nullability and optionality.
 */
export interface SchemaOptionsBase {
    /**
     * Whether the schema accepts null values
     */
    nullable?: boolean;
    /**
     * Whether the schema accepts undefined values
     */
    optional?: boolean;
}

/**
 * Extracts the options type from a schema type.
 * @template S - The schema type to extract options from
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsOf<S extends SchemaAny> = S extends Schema<any, infer O> ? O : never;

/**
 * Simplifies a schema options type by removing default and validators properties.
 * @template O - The schema options type to simplify
 */
export type SchemaOptionsSimlify<O extends SchemaOptionsAny> = Simplify<{
    [K in Exclude<keyof O, 'default' | 'validate'>]: O[K];
}>;

/**
 * Interface for schema properties that can be extended by specific schema types.
 * @template V - The value type that the schema validates
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SchemaProps<V> {}

/**
 * Interface defining the prototype methods for a schema.
 * @template V - The value type that the schema validates
 * @template U - The type that values are coerced to (defaults to V)
 */
export interface SchemaProto<V = unknown, U = V> {
    /**
     * Coerces a value to the schema's type, or returns undefined if coercion fails
     */
    coerce: (value: unknown) => undefined | V;
    /**
     * Serializes a value to a format suitable for storage or transmission
     */
    serialize: (value: U) => unknown;
    /**
     * Checks if a value is valid according to the schema
     */
    check: (value: unknown) => boolean;
    /**
     * Returns the default value for the schema
     */
    default: () => V;
    /**
     * Optional method to visit values during traversal
     */
    visit?: (value: U, visitor: SchemaVisitor) => void;
}

/**
 * Type representing any schema prototype, regardless of value types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaProtoAny = SchemaProto<any, any>;

/**
 * Interface for schema visitors that can traverse and transform values.
 */
export interface SchemaVisitor {
    (schema: Schema, value: unknown, key: number | string): unknown;
}

/**
 * Type representing a nullable value based on a boolean flag.
 * @template N - The boolean flag indicating nullability
 */
type NullableValue<N extends boolean> = N extends false ? never : null;

/**
 * Type representing an optional value based on a boolean flag.
 * @template N - The boolean flag indicating optionality
 */
type OptionalValue<N extends boolean> = N extends false ? never : undefined;
