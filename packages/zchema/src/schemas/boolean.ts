import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Schema type for boolean values.
 * @template O - Schema options type
 */
export type BooleanSchema<O extends SchemaOptions<boolean>> = Schema<boolean, O>;

/**
 * Protocol implementation for boolean schema.
 */
const proto: SchemaProto<boolean> = {
    coerce: Boolean,
    serialize: identity,
    check: value => typeof value === 'boolean',
    default: () => false,
};

/**
 * Base type for boolean schema definition.
 */
type BooleanSchemaBase = {
    /** Creates a boolean schema with default options */
    (): BooleanSchema<{}>;
    /** Creates a boolean schema with custom options */
    <O extends object>(options: O & SchemaOptions<boolean>): BooleanSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for boolean values.
 *
 * @example
 * ```ts
 * const bool = boolean();
 * const requiredBool = boolean({ required: true });
 * const defaultBool = boolean({ default: () => true });
 * ```
 */
export const boolean = defineSchema<BooleanSchemaBase>({
    name: 'boolean',
    proto: () => proto,
});
