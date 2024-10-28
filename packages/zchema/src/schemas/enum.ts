import type { Primitive } from '@nzyme/types';
import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type EnumSchemaOptions<V extends Primitive[] = Primitive[]> = SchemaOptions<V[number]> & {
    values: V;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EnumSchema<O extends EnumSchemaOptions> = ForceName<Schema<O['values'][number], O>>;

declare class FF {}
type ForceName<T> = T & FF;

export type EnumSchemaValue<O extends EnumSchemaOptions> = O['values'][number];

type EnumSchemaFactory = {
    <const V extends Primitive[]>(values: V): EnumSchema<{ values: V }>;
    <const V extends Primitive[], O extends EnumSchemaOptions<V>>(
        options: O & EnumSchemaOptions<V>,
    ): EnumSchema<SchemaOptionsSimlify<O>>;
};

export const enumSchema = defineSchema<EnumSchemaFactory, EnumSchemaOptions>({
    options: (optionsOrValues: EnumSchemaOptions | Primitive[]) => {
        const options: EnumSchemaOptions = Array.isArray(optionsOrValues)
            ? { values: optionsOrValues }
            : optionsOrValues;

        return options;
    },
    proto: options => {
        const values = options.values;
        const valuesSet = new Set(values);

        const proto: SchemaProto<Primitive> = {
            coerce(value) {
                if (valuesSet.has(value as Primitive)) {
                    return value as Primitive;
                }

                return values[0];
            },
            serialize: identity,
            check(value): value is Primitive {
                return valuesSet.has(value as Primitive);
            },
            default: () => values[0],
        };

        return proto;
    },
});
