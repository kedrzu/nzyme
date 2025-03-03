import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto, Infer } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import type { Extend } from '../utils/extend.js';

export type LazySchemaOptions<T extends Schema = Schema> = SchemaOptions<Infer<T>> & {
    of: () => T;
};

export type LazySchema<O extends LazySchemaOptions = LazySchemaOptions> = ForceName<
    O extends LazySchemaOptions<infer T extends Schema> ? Schema<Infer<T>, O> : never
>;

export type LazySchemaResolved<S extends LazySchema> =
    S extends LazySchema<infer O extends LazySchemaOptions>
        ? Extend<LazySchemaInner<S>, Omit<O, 'proto' | 'type'>>
        : never;

declare class FF {}
type ForceName<T> = T & FF;

export type LazySchemaValue<O extends LazySchemaOptions> = Infer<ReturnType<O['of']>>;
export type LazySchemaInner<S extends LazySchema> = ReturnType<S['of']>;

type LazySchemaBase = {
    <S extends Schema>(of: () => S): LazySchema<{ of: () => S }>;
    <O extends LazySchemaOptions>(
        options: O & LazySchemaOptions<ReturnType<O['of']>>,
    ): LazySchema<SchemaOptionsSimlify<O>>;
};

const lazyProto: SchemaProto<unknown> = {
    coerce: lazyThrow,
    serialize: lazyThrow,
    check: lazyThrow,
    default: lazyThrow,
    visit: lazyThrow,
};

export const lazy = defineSchema<LazySchemaBase, LazySchemaOptions>({
    name: 'lazy',
    options: (optionsOrSchema: (() => Schema) | LazySchemaOptions) => {
        if (typeof optionsOrSchema === 'function') {
            return {
                of: lazyWrapper(optionsOrSchema),
            };
        }

        optionsOrSchema.of = lazyWrapper(optionsOrSchema.of);
        return optionsOrSchema;
    },
    proto: () => lazyProto,
});

export function lazyResolve<S extends Schema>(
    schema: S,
): S extends LazySchema ? LazySchemaResolved<S> : S;
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

function lazyWrapper(of: () => Schema) {
    let schema: Schema | undefined;
    return () => {
        if (!schema) {
            schema = of();
        }

        return schema;
    };
}

function lazyThrow<T>(): T {
    throw new Error('Resolve lazy schema before first use');
}

function isLazySchema(schema: Schema): schema is LazySchema {
    return schema.type === lazy;
}
