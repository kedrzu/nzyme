import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Date schema options.
 */
export type DateSchemaOptions = SchemaOptions<Date> & {
    /**
     * Default value.
     */
    default?: () => Date;
};

/**
 * Date schema.
 */
export type DateSchema<O extends DateSchemaOptions = DateSchemaOptions> = Schema<Date, O>;

const proto: SchemaProto<Date> = {
    coerce: val => new Date(val as string | number),
    serialize: date => date.toISOString(),
    check: value => value instanceof Date,
    default: () => new Date(0),
};

type DateSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    (): DateSchema<{}>;
    <O extends object>(options: O & SchemaOptions<Date>): DateSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a date schema.
 */
export const date = defineSchema<DateSchemaBase>({
    name: 'date',
    proto: () => proto,
});
