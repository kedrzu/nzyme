import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto, Infer } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import { serialize } from '../utils/serialize.js';

export type UnionSchemaOptions<T extends Schema[] = Schema[]> = SchemaOptions<Infer<T[number]>> & {
    of: T;
    default?: () => Infer<T[number]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnionSchema<O extends UnionSchemaOptions = UnionSchemaOptions> = ForceName<
    O extends UnionSchemaOptions<infer T extends Schema[]> ? Schema<Infer<T[number]>, O> : never
>;

declare class FF {}
type ForceName<T> = T & FF;

export type UnionSchemaValue<O extends UnionSchemaOptions> = Infer<O['of'][number]>;

type UnionSchemaBase = {
    <S extends Schema[]>(of: S): UnionSchema<{ of: S }>;
    <O extends UnionSchemaOptions>(
        options: O & UnionSchemaOptions<O['of']>,
    ): UnionSchema<SchemaOptionsSimlify<O>>;
};

export const union = defineSchema<UnionSchemaBase, UnionSchemaOptions>({
    name: 'union',
    options: (optionsOrSchema: Schema[] | UnionSchemaOptions) => {
        // TODO: check if there are no multi objects or arrays
        const options: UnionSchemaOptions = Array.isArray(optionsOrSchema)
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
            check(value): value is unknown[] {
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
