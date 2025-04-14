import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Options for defining a date schema.
 */
export type DateSchemaOptions = SchemaOptions<Date> & {
    /**
     * Function that returns the default date value.
     * @returns A new Date instance
     */
    default?: () => Date;
};

/**
 * Schema type for Date objects.
 * @template O - Date schema options type
 */
export type DateSchema<O extends DateSchemaOptions = DateSchemaOptions> = Schema<Date, O>;

/**
 * Prototype implementation for date schema.
 */
const proto: SchemaProto<Date> = {
    coerce: val => new Date(val as string | number),
    serialize: date => date.toISOString(),
    check: value => value instanceof Date,
    default: () => new Date(0),
};

/**
 * Base type for date schema definition.
 */
type DateSchemaBase = {
    /** Creates a date schema with default options */
    (): DateSchema<{}>;
    /** Creates a date schema with custom options */
    <O extends object>(options: O & SchemaOptions<Date>): DateSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for Date objects.
 *
 * @example
 * ```ts
 * const dateField = date();
 * const requiredDate = date({ required: true });
 * const defaultDate = date({ default: () => new Date() });
 * ```
 */
export const date = defineSchema<DateSchemaBase>({
    name: 'date',
    proto: () => proto,
});
