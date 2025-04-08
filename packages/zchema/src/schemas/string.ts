import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * String schema options.
 */
export type StringSchema<O extends SchemaOptions<string> = SchemaOptions<string>> = Schema<
    string,
    O
>;

const proto: SchemaProto<string> = {
    coerce: String,
    serialize: identity,
    check: value => typeof value === 'string',
    default: () => '',
};

type StringSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    (): StringSchema<{}>;
    <O extends object>(options: O & SchemaOptions<string>): StringSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a string schema.
 */
export const string = defineSchema<StringSchemaBase>({
    name: 'string',
    proto: () => proto,
});
