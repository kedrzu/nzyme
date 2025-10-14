import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaMeta,
    SchemaOptions,
    SchemaProto,
} from '../Schema.js';

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
export type DateSchema<O extends SchemaOptionsBase = SchemaOptionsBase> = Schema<Date, O>;

/**
 * Prototype implementation for date schema.
 */
const proto: SchemaProto<Date> = {
    coerce: val => new Date(val as number | string),
    serialize: date => date.toISOString(),
    check: value => value instanceof Date,
    default: () => new Date(0),
};

/**
 * Base type for date schema definition.
 */
export type DateSchemaConstructor = {
    /** Creates a date schema with default options */
    (): DateSchema<{}>;
    /** Creates a date schema with custom options */
    <
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<Date, TNullable, TOptional, TMeta>,
    ): DateSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
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
export const date = defineSchema<DateSchemaConstructor>({
    name: 'date',
    proto: () => proto,
});
