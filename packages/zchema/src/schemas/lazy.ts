import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto, Infer } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type LazySchemaOptions<T extends Schema = Schema> = SchemaOptions<Infer<T>> & {
    of: () => T;
};

export type LazySchema<O extends LazySchemaOptions = LazySchemaOptions> = ForceName<
    O extends LazySchemaOptions<infer T extends Schema> ? Schema<Infer<T>, O> : never
>;

declare class FF {}
type ForceName<T> = T & FF;

export type LazySchemaValue<O extends LazySchemaOptions> = Infer<ReturnType<O['of']>>;

type LazySchemaBase = {
    <S extends Schema>(of: () => S): LazySchema<{ of: () => S }>;
    <O extends LazySchemaOptions>(
        options: O & LazySchemaOptions<ReturnType<O['of']>>,
    ): LazySchema<SchemaOptionsSimlify<O>>;
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
    proto: options => {
        const schema = options.of;

        const proto: SchemaProto<unknown> = {
            coerce: value => schema().proto.coerce(value),
            serialize: value => schema().proto.serialize(value),
            check: value => schema().proto.check(value),
            default: () => schema().proto.default(),
            visit: (value, visitor) => schema().proto.visit?.(value, visitor),
        };

        return proto;
    },
});

function lazyWrapper(of: () => Schema) {
    let schema: Schema | undefined;
    return () => {
        if (!schema) {
            schema = of();
        }

        return schema;
    };
}
