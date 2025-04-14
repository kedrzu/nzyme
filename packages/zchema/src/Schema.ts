import type { IfAny, IfUnknown, PartialOnUndefined, Simplify } from '@nzyme/types';
import type { Validator } from '@nzyme/validation';

/**
 *
 */
export type Infer<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any>
        ? NullableValue<TSchema['nullable']> | OptionalValue<TSchema['optional']> | V
        : never;

/**
 *
 */
export type InferNonNull<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any> ? V : never;

/**
 *
 */
export type InferOr<TSchema, T = undefined> = TSchema extends Schema ? Infer<TSchema> : T;

/**
 *
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
        validators: Validator[];
    };

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaAny = Schema<any, any>;

/**
 *
 */
export type SchemaBase<S extends Schema = Schema> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): S;
};

/**
 *
 */
export type SchemaDefault<V> = (() => V) | V;

declare const SCHEMA_FACTORY_OPTIONS: unique symbol;

/**
 *
 */
export interface SchemaFactory<T = unknown, O extends SchemaOptions<T> = SchemaOptions<T>> {
    <OO extends O>(options: OO): Schema<T, OO>;
    /**
     * @internal
     */
    [SCHEMA_FACTORY_OPTIONS]: O;
}

/**
 *
 */
export type SchemaOf<T> = Schema<
    Exclude<T, null | undefined>,
    {
        /**
         *
         */
        nullable: null extends T ? true : false;
        /**
         *
         */
        optional: undefined extends T ? true : false;
    }
>;

/**
 *
 */
export interface SchemaOptions<V = unknown> extends SchemaOptionsBase, SchemaProps<V> {
    /**
     *
     */
    default?: SchemaDefault<V>;
    /**
     *
     */
    validators?: Validator<V>[];
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsAny = SchemaOptions<any>;

/**
 *
 */
export interface SchemaOptionsBase {
    /**
     *
     */
    nullable?: boolean;
    /**
     *
     */
    optional?: boolean;
}

/**
 *
 */
export type SchemaOptionsOf<S extends SchemaAny> = S extends Schema<any, infer O> ? O : never;

/**
 *
 */
export type SchemaOptionsSimlify<O extends SchemaOptions<any>> = Simplify<{
    [K in Exclude<keyof O, 'default' | 'validators'>]: O[K];
}>;

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SchemaProps<V> {}

/**
 *
 */
export interface SchemaProto<V = unknown, U = V> {
    /**
     *
     */
    coerce: (value: unknown) => undefined | V;
    /**
     *
     */
    serialize: (value: U) => unknown;
    /**
     *
     */
    check: (value: unknown) => boolean;
    /**
     *
     */
    default: () => V;
    /**
     *
     */
    visit?: (value: U, visitor: SchemaVisitor) => void;
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaProtoAny = SchemaProto<any, any>;

/**
 *
 */
export interface SchemaVisitor {
    (schema: Schema, value: unknown, key: number | string): unknown;
}
type NullableValue<N extends boolean> = N extends false ? never : null;

type OptionalValue<N extends boolean> = N extends false ? never : undefined;
