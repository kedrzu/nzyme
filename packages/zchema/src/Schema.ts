import type { Container } from '@nzyme/ioc/Container.js';
import type { Primitive } from '@nzyme/types/Common.js';
import type { Flatten, OmitPropTypes } from '@nzyme/types/Object.js';
import type { IfAny, IfUnknown } from '@nzyme/types/TypeGuards.js';
import type { Validator } from '@nzyme/validation/Validator.js';

/**
 * Infers the TypeScript type from a schema definition.
 * @template TSchema - The schema type to infer from
 * @returns The inferred type, including null and undefined if the schema allows them
 */
export type Infer<TSchema extends Schema> =
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
export type Schema<V = unknown, O extends SchemaOptionsBase = SchemaOptionsBase> = SchemaProps<V> & {
    /**
     * Function that returns the default value for the schema when no value is provided.
     * The function is called with the schema context as its parameter.
     */
    default?: () => V;
    /**
     * Metadata associated with the schema. This can be used to store additional
     * information about the schema that doesn't affect its validation behavior.
     */
    meta: Flatten<O['meta'] & SchemaMeta>;
    /**
     * Indicates whether the schema accepts null values. When true, the schema
     * will validate null as a valid value.
     */
    nullable: IfAny<O, boolean, IfUnknown<O['nullable'], false, Exclude<O['nullable'], undefined>>>;
    /**
     * Indicates whether the schema accepts undefined values. When true, the schema
     * will validate undefined as a valid value.
     */
    optional: IfAny<O, boolean, IfUnknown<O['optional'], false, Exclude<O['optional'], undefined>>>;
    /**
     * The prototype methods for the schema, containing validation and transformation
     * logic for the schema.
     */
    proto: SchemaProto<V, unknown>;
    /**
     * The base type of the schema, used for type inference and factory function
     * creation.
     */
    type: SchemaBase;
    /**
     * Array of validators that will be applied to values when validating against
     * this schema.
     */
    validate: Validator[];
};

/**
 * Base schema properties. Can be extended to add custom properties to schemas.
 * @template V - The value type of the schema
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SchemaProps<V> {}

/**
 * Base schema meta. Can be extended to add custom meta to schemas.
 */
export interface SchemaMeta {}

/**
 * Interface representing the context in which a schema operates.
 * This context is passed to schema methods during validation and transformation.
 */
export interface SchemaContext {
    /**
     * Optional dependency injection container that can be used by schema methods
     * to resolve dependencies.
     */
    container?: Container;
}

/**
 * Default schema context with no container or additional context.
 * This is used as the base context when no specific context is provided.
 */
export const DEFAULT_SCHEMA_CONTEXT: SchemaContext = Object.freeze({});

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
export type SchemaDefault<V> = IfUnknown<V, (() => V) | V, V extends Primitive ? (() => V) | V : () => V>;

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
export type SchemaOptions<
    V = unknown,
    TNullable extends boolean | undefined = boolean | undefined,
    TOptional extends boolean | undefined = boolean | undefined,
    TMeta extends SchemaMeta | undefined = SchemaMeta | undefined,
    TOptions extends object = {},
> = SchemaProps<V> &
    TOptions & {
        /**
         * Default value or function for the schema
         */
        default?: SchemaDefault<V>;
        /** Custom metadata attached to the schema for code generation or documentation */
        meta?: TMeta;
        /**
         * Whether the schema accepts null values
         */
        nullable?: TNullable;
        /**
         * Whether the schema accepts undefined values
         */
        optional?: TOptional;
        /**
         * Array of validators to apply to values
         */
        validate?: Validator<V> | Validator<V>[];
    };

/**
 * Type representing any schema options, regardless of value type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsAny = SchemaOptions<any>;

/**
 * Base schema options without value-type constraints, used for schema constructors.
 */
export type SchemaOptionsBase<TOptions extends object = {}> = Flatten<
    TOptions & {
        /** Custom metadata attached to the schema */
        meta?: object;
        /**
         * Whether the schema accepts null values
         */
        nullable?: boolean;
        /**
         * Whether the schema accepts undefined values
         */
        optional?: boolean;
    }
>;

/**
 * Base interface for schema options that define nullability and optionality.
 */
export type SchemaOptionsSimplify<
    TNullable extends boolean | undefined,
    TOptional extends boolean | undefined,
    TMeta extends object | undefined,
    TOptions extends object = {},
> = Flatten<
    OmitPropTypes<
        {
            meta: TMeta;
            /**
             * Whether the schema accepts null values
             */
            nullable: TNullable;
            /**
             * Whether the schema accepts undefined values
             */
            optional: TOptional;
        },
        undefined
    > &
        TOptions
>;

/**
 * Extracts the options type from a schema type.
 * @template S - The schema type to extract options from
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaConfigOf<S extends SchemaAny> = S extends Schema<any, infer O> ? O : never;

/**
 * Interface defining the prototype methods for a schema.
 * @template V - The value type that the schema validates
 * @template U - The type that values are coerced to (defaults to V)
 */
export interface SchemaProto<V = unknown, U = V> {
    /**
     * Coerces a value to the schema's type, or returns undefined if coercion fails
     */
    coerce: (value: unknown, context: SchemaContext) => V | undefined;
    /**
     * Serializes a value to a format suitable for storage or transmission
     */
    serialize: (value: U, context: SchemaContext) => unknown;
    /**
     * Checks if a value is valid according to the schema
     */
    check: (value: unknown, context: SchemaContext) => boolean;
    /**
     * Returns the default value for the schema
     */
    default: (context: SchemaContext) => V;
    /**
     * Optional method to visit values during traversal
     */
    visit?: (value: U, visitor: SchemaVisitor, context: SchemaContext) => void;
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
