import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Schema type for number values.
 * @template O - Schema options type
 */
export type NumberSchema<O extends SchemaOptions<number>> = Schema<number, O>;

/**
 * Prototype implementation for number schema.
 */
const proto: SchemaProto<number> = {
    coerce: Number,
    serialize: identity,
    check: value => typeof value === 'number',
    default: () => 0,
};

/**
 * Base type for number schema definition.
 */
type NumberSchemaBase = {
    /** Creates a number schema with default options */
    (): NumberSchema<{}>;
    /** Creates a number schema with custom options */
    <O extends object>(options: O & SchemaOptions<number>): NumberSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for number values.
 *
 * @example
 * ```ts
 * const price = number();
 * const requiredPrice = number({ required: true });
 * const defaultPrice = number({ default: () => 99.99 });
 * ```
 */
export const number = defineSchema<NumberSchemaBase>({
    name: 'number',
    proto: () => proto,
});
