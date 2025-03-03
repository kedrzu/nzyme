import type {
    Schema,
    SchemaAny,
    SchemaOptions,
    SchemaOptionsSimlify,
    SchemaProto,
    Infer,
} from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

export type RecordSchemaOptions<T extends SchemaAny = SchemaAny> = SchemaOptions<
    RecordValue<Infer<T>>
> & {
    of: T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecordSchema<O extends RecordSchemaOptions = RecordSchemaOptions> = ForceName<
    O extends RecordSchemaOptions<infer T extends SchemaAny>
        ? Schema<RecordValue<Infer<T>>, O>
        : never
>;

declare class FF {}
type ForceName<T> = T & FF;

export type RecordValue<T = unknown> = Record<string, T | undefined>;
export type RecordSchemaValue<O extends RecordSchemaOptions> = RecordValue<Infer<O['of']>>;

type RecordSchemaBase = {
    <S extends SchemaAny>(of: S): RecordSchema<{ of: S }>;
    <O extends RecordSchemaOptions>(
        options: O & RecordSchemaOptions<O['of']>,
    ): RecordSchema<SchemaOptionsSimlify<O>>;
};

export const record = defineSchema<RecordSchemaBase, RecordSchemaOptions>({
    name: 'record',
    options: (optionsOrSchema: SchemaAny | RecordSchemaOptions) => {
        const options: RecordSchemaOptions = isSchema(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const itemSchema = options.of;

        const proto: SchemaProto<RecordValue> = {
            coerce(value) {
                const result: RecordValue = {};

                for (const [key, item] of Object.entries(value as object)) {
                    result[key] = coerce(itemSchema, item);
                }

                return result;
            },
            serialize(value) {
                const result: RecordValue = {};

                for (const [key, item] of Object.entries(value as object)) {
                    result[key] = serialize(itemSchema, item);
                }

                return result;
            },
            check(value): value is RecordValue {
                return typeof value === 'object' && value !== null;
            },
            default: () => ({}),
            visit(value, visitor) {
                for (const [key, item] of Object.entries(value as object)) {
                    visitor(itemSchema, item, key);
                }
            },
        };

        return proto;
    },
});
