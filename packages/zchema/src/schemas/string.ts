import { identity } from '@nzyme/utils';

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
 * Schema type for string values.
 * @template O - Schema options type
 */
export type StringSchema<O extends SchemaOptionsBase = SchemaOptionsBase> = Schema<string, O>;

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
    <
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<string, TNullable, TOptional, TMeta>,
    ): StringSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
};

/**
 * Creates a schema for string values.
 *
 * @example
 * ```ts
 * const name = string();
 * const requiredName = string({ required: true });
 * const defaultName = string({ default: () => 'John' });
 * ```
 */
export const string = defineSchema<StringSchemaBase>({
    name: 'string',
    proto: () => proto,
});
