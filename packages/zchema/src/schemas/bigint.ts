import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type BigintSchema<O extends SchemaOptions<bigint>> = Schema<bigint, O>;

const proto: SchemaProto<bigint> = {
    coerce: BigInt as (value: unknown) => bigint,
    serialize: String,
    check: value => typeof value === 'bigint',
    default: () => 0n,
};

type BigintSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    (): BigintSchema<{}>;
    <O extends object>(options: O & SchemaOptions<bigint>): BigintSchema<SchemaOptionsSimlify<O>>;
};

export const bigint = defineSchema<BigintSchemaBase>({
    name: 'bigint',
    proto: () => proto,
});
