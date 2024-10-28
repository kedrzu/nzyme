import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

export type UnknownSchema<V, O extends SchemaOptions<V>> = ForceName<Schema<V, O>>;

declare class FF {}
type ForceName<T> = T & FF;

const proto: SchemaProto<unknown> = {
    coerce: identity,
    serialize: identity,
    check(value): value is unknown {
        return true;
    },
    default: () => null,
};

type UnknownSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    <V = unknown, O extends SchemaOptions<V> = {}>(
        options?: O & SchemaOptions<unknown>,
    ): UnknownSchema<V, SchemaOptionsSimlify<O>>;
};

export const unknown = defineSchema<UnknownSchemaBase>({
    proto: () => proto,
});
