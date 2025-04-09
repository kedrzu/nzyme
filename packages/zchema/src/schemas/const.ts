import type { Primitive } from '@nzyme/types';

import type { Schema, SchemaOptions } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type ConstSchemaOptions<V extends Primitive = Primitive> = SchemaOptions<V> & {
    value: V;
    default?: undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstSchema<O extends ConstSchemaOptions> = ForceName<Schema<O['value'], O>>;

declare class FF {}
type ForceName<T> = T & FF;

type ConstSchemaBase = {
    <V extends Primitive>(value: V): ConstSchema<{ value: V }>;
};

export const constSchema = defineSchema<ConstSchemaBase, ConstSchemaOptions>({
    name: 'const',
    options: (value: Primitive) => {
        const options: ConstSchemaOptions = {
            value,
        };

        return options;
    },
    proto: (options: ConstSchemaOptions) => {
        const value = options.value;
        const getter = () => value;

        return {
            coerce: getter,
            serialize: getter,
            check: (v): v is Primitive => v === value,
            default: getter,
        };
    },
});
