import { identity } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';

/**
 * Schema type for integer values.
 * @template O - Schema options type
 */
export type IntegerSchema<O extends SchemaOptions<number> = SchemaOptions<number>> = Schema<
    number,
    O
>;

/**
 * Prototype implementation for integer schema.
 * This prototype validates that a value is an integer and coerces non-integer values
 * by rounding them up to the nearest integer.
 */
const proto: SchemaProto<number> = {
    coerce: v => Math.ceil(Number(v)),
    serialize: identity,
    check: Number.isInteger as (value: unknown) => value is number,
    default: () => 0,
};

/**
 * Base type for integer schema definition.
 * Provides overloads for creating integer schemas with different options.
 */
type IntegerSchemaBase = {
    /** Creates an integer schema with default options */
    (): IntegerSchema<{}>;
    /** Creates an integer schema with custom options */
    <O extends object>(options: O & SchemaOptions<number>): IntegerSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for integer values.
 * This schema validates that a value is an integer and coerces non-integer values
 * by rounding them up to the nearest integer.
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
