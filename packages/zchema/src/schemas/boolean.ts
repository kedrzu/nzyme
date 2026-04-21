import { identity } from '@nzyme/utils/functions/identity.js';

import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';

/**
 * Schema type for boolean values.
 * @template O - Schema options type
 */
export type BooleanSchema<O extends SchemaOptionsBase = SchemaOptionsBase> = Schema<boolean, O>;

/**
 * Prototype implementation for boolean schema.
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
export type BooleanSchemaBase = {
    /** Creates a boolean schema with default options */
    (): BooleanSchema<{}>;
    /** Creates a boolean schema with custom options */
    <
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<boolean, TNullable, TOptional, TMeta>,
    ): BooleanSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
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
