import { identity } from '@nzyme/utils/functions/identity.js';

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
 * Schema type for unknown values.
 * @template V - Value type
 * @template O - Schema options type
 */
export type UnknownSchema<V = unknown, O extends SchemaOptionsBase = SchemaOptionsBase> = ForceName & Schema<V, O>;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Prototype implementation for unknown schema.
 * This prototype accepts any value and passes it through unchanged.
 */
const proto: SchemaProto<unknown> = {
    coerce: identity,
    serialize: identity,
    check(value): value is unknown {
        return true;
    },
    default: () => null,
};

/**
 * Base type for unknown schema definition.
 * Provides overloads for creating unknown schemas with different options.
 */
export type UnknownSchemaConstructor = {
    /** Creates an unknown schema with default options */
    (): UnknownSchema<unknown, {}>;
    /** Creates an unknown schema with custom options */
    <
        V = unknown,
        TNullable extends boolean = true,
        TOptional extends boolean = true,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options?: SchemaOptions<V, TNullable, TOptional, TMeta>,
    ): UnknownSchema<V, SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
};

/**
 * Creates a schema for unknown values.
 * This schema accepts any value and is useful for representing values of unknown type.
 * By default, it is both nullable and optional.
 *
 * @example
 * ```ts
 * const anyValue = unknown();
 * const requiredValue = unknown({ required: true });
 * const nonNullableValue = unknown({ nullable: false });
 * ```
 */
export const unknown = defineSchema<UnknownSchemaConstructor>({
    name: 'unknown',
    options: (options?: SchemaOptions<unknown>) => {
        const nullable = options?.nullable ?? true;
        const optional = options?.optional ?? true;

        return {
            ...options,
            nullable,
            optional,
        };
    },
    proto: () => proto,
});
