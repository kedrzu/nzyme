import type { IfAny, IfUnknown, Simplify } from '@nzyme/types';
import type { Validator } from '@nzyme/validation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
export interface SchemaProps<V> {}

export interface SchemaOptionsBase {
    nullable?: boolean;
    optional?: boolean;
}

export interface SchemaOptions<V = unknown> extends SchemaProps<V>, SchemaOptionsBase {
    default?: () => V;
    validators?: Validator<V>[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsSimlify<O extends SchemaOptions<any>> = Simplify<{
    [K in Exclude<keyof O, 'validators' | 'default'>]: O[K];
}>;

export interface SchemaProto<V = unknown, U = V> {
    coerce: (value: unknown) => V | undefined;
    serialize: (value: U) => unknown;
    check: (value: unknown) => boolean;
    default: () => V;
    visit?: (value: U, visitor: SchemaVisitor) => void;
}

export type SchemaBase<S extends Schema = Schema> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): S;
};

export interface SchemaVisitor {
    (schema: Schema, value: unknown, key: string | number): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaOptionsOf<S extends SchemaAny> = S extends Schema<any, infer O> ? O : never;

export type Schema<V = unknown, O extends SchemaOptions<V> = SchemaOptions<V>> = SchemaProps<V> & {
    proto: SchemaProto<V, unknown>;
    type: SchemaBase;
    nullable: IfAny<O, boolean, IfUnknown<O['nullable'], false, Exclude<O['nullable'], undefined>>>;
    optional: IfAny<O, boolean, IfUnknown<O['optional'], false, Exclude<O['optional'], undefined>>>;
    default?: () => V;
    validators: Validator[];
} & {
    [K in Exclude<keyof O, keyof SchemaOptions<V>>]: O[K];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaAny = Schema<any, any>;

export type InferNonNull<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any> ? V : never;

export type InferOr<TSchema, T = undefined> = TSchema extends Schema ? Infer<TSchema> : T;

export type Infer<TSchema extends SchemaAny> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends Schema<infer V, any>
        ? V | NullableValue<TSchema['nullable']> | OptionalValue<TSchema['optional']>
        : never;

type NullableValue<N extends boolean> = N extends false ? never : null;
type OptionalValue<N extends boolean> = N extends false ? never : undefined;

export type SchemaOf<T> = Schema<
    Exclude<T, undefined | null>,
    {
        nullable: null extends T ? true : false;
        optional: undefined extends T ? true : false;
    }
>;
