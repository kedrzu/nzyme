import { isIterable } from '@nzyme/utils';

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

export type ArraySchemaOptions<T extends SchemaAny = SchemaAny> = SchemaOptions<Infer<T>[]> & {
    of: T;
    default?: () => Infer<T>[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArraySchema<O extends ArraySchemaOptions = ArraySchemaOptions> = ForceName<
    O extends ArraySchemaOptions<infer T extends SchemaAny> ? Schema<Infer<T>[], O> : never
>;

declare class FF {}
type ForceName<T> = T & FF;

export type ArraySchemaValue<O extends ArraySchemaOptions> = Infer<O['of']>[];

type ArraySchemaBase = {
    <S extends SchemaAny>(of: S): ArraySchema<{ of: S }>;
    <O extends ArraySchemaOptions>(
        options: O & ArraySchemaOptions<O['of']>,
    ): ArraySchema<SchemaOptionsSimlify<O>>;
};

export const array = defineSchema<ArraySchemaBase, ArraySchemaOptions>({
    name: 'array',
    options: (optionsOrSchema: SchemaAny | ArraySchemaOptions) => {
        const options: ArraySchemaOptions = isSchema(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const itemSchema = options.of;

        const proto: SchemaProto<unknown[]> = {
            coerce(value) {
                const result: unknown[] = [];

                if (!isIterable(value)) {
                    return result;
                }

                for (const item of value) {
                    result.push(coerce(itemSchema, item));
                }

                return result;
            },
            serialize(value) {
                const result: unknown[] = [];

                for (const item of value) {
                    result.push(serialize(itemSchema, item));
                }

                return result;
            },
            check(value): value is unknown[] {
                return Array.isArray(value);
            },
            default: () => [],
            visit(value, visitor) {
                for (let i = 0; i < value.length; i++) {
                    visitor(itemSchema, value[i], i);
                }
            },
        };

        return proto;
    },
});
