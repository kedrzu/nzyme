import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Integer schema options.
 */
export type IntegerSchema<O extends SchemaOptions<number> = SchemaOptions<number>> = Schema<
    number,
    O
>;

const proto: SchemaProto<number> = {
    coerce: v => Math.ceil(Number(v)),
    serialize: identity,
    check: Number.isInteger as (value: unknown) => value is number,
    default: () => 0,
};

type IntegerSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    (): IntegerSchema<{}>;
    <O extends object>(options: O & SchemaOptions<number>): IntegerSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates an integer schema.
 */
export const integer = defineSchema<IntegerSchemaBase>({
    name: 'integer',
    proto: () => proto,
});
