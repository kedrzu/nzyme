import { identity } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaConfigBase,
    SchemaConfigSimplify,
    SchemaOptions,
    SchemaProto,
} from '../Schema.js';

/**
 * Schema type for number values.
 * @template O - Schema options type
 */
export type NumberSchema<O extends SchemaConfigBase = SchemaConfigBase> = Schema<number, O>;

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
export type NumberSchemaConstructor = {
    /** Creates a number schema with default options */
    (): NumberSchema<{}>;
    /** Creates a number schema with custom options */
    <
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends object | undefined = undefined,
    >(
        options: SchemaOptions<number, TNullable, TOptional, TMeta>,
    ): NumberSchema<SchemaConfigSimplify<TNullable, TOptional, TMeta>>;
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
export const number = defineSchema<NumberSchemaConstructor>({
    name: 'number',
    proto: () => proto,
});
