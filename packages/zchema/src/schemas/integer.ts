import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Schema type for integer values.
 * @template O - Schema options type
 */
export type IntegerSchema<O extends SchemaOptions<number> = SchemaOptions<number>> = Schema<
    number,
    O
>;

/**
 * Protocol implementation for integer schema.
 */
const proto: SchemaProto<number> = {
    coerce: v => Math.ceil(Number(v)),
    serialize: identity,
    check: Number.isInteger as (value: unknown) => value is number,
    default: () => 0,
};

/**
 * Base type for integer schema definition.
 */
type IntegerSchemaBase = {
    /** Creates an integer schema with default options */
    (): IntegerSchema<{}>;
    /** Creates an integer schema with custom options */
    <O extends object>(options: O & SchemaOptions<number>): IntegerSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for integer values.
 *
 * @example
 * ```ts
 * const age = integer();
 * const requiredAge = integer({ required: true });
 * const defaultAge = integer({ default: () => 18 });
 * ```
 */
export const integer = defineSchema<IntegerSchemaBase>({
    name: 'integer',
    proto: () => proto,
});
