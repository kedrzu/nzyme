import { identity } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';

/**
 * Schema type for string values.
 * @template O - Schema options type
 */
export type StringSchema<O extends SchemaOptions<string> = SchemaOptions<string>> = Schema<
    string,
    O
>;

/**
 * Prototype implementation for string schema.
 */
const proto: SchemaProto<string> = {
    coerce: String,
    serialize: identity,
    check: value => typeof value === 'string',
    default: () => '',
};

/**
 * Base type for string schema definition.
 */
type StringSchemaBase = {
    /** Creates a string schema with default options */
    (): StringSchema<{}>;
    /** Creates a string schema with custom options */
    <O extends object>(options: O & SchemaOptions<string>): StringSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for string values.
 *
 * @example
 * ```ts
 * const name = string();
 * const requiredName = string({ required: true });
 * const defaultName = string({ default: () => 'Anonymous' });
 * ```
 */
export const string = defineSchema<StringSchemaBase>({
    name: 'string',
    proto: () => proto,
});
