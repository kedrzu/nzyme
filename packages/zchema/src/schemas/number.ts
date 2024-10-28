import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type NumberSchema<O extends SchemaOptions<number>> = Schema<number, O>;

const proto: SchemaProto<number> = {
    coerce: Number,
    serialize: identity,
    check: value => typeof value === 'number',
    default: () => 0,
};

type NumberSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    <O extends SchemaOptions<number> = {}>(
        options?: O & SchemaOptions<number>,
    ): NumberSchema<SchemaOptionsSimlify<O>>;
};

export const number = defineSchema<NumberSchemaBase>({
    proto: () => proto,
});
