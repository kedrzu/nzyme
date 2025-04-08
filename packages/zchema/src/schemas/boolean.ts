import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Boolean schema.
 */
export type BooleanSchema<O extends SchemaOptions<boolean>> = Schema<boolean, O>;

const proto: SchemaProto<boolean> = {
    coerce: Boolean,
    serialize: identity,
    check: value => typeof value === 'boolean',
    default: () => false,
};

type BooleanSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    (): BooleanSchema<{}>;
    <O extends object>(options: O & SchemaOptions<boolean>): BooleanSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a boolean schema.
 */
export const boolean = defineSchema<BooleanSchemaBase>({
    name: 'boolean',
    proto: () => proto,
});
