import { identity } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';

/**
 * Schema type for unknown values.
 * @template V - Value type
 * @template O - Schema options type
 */
export type UnknownSchema<V, O extends SchemaOptions<V>> = ForceName & Schema<V, O>;

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
type UnknownSchemaBase = {
    /** Creates an unknown schema with default options */
    (): UnknownSchema<unknown, {}>;
    /** Creates an unknown schema with custom options for unknown type */
    <O extends SchemaOptions<unknown> = {}>(options: O): UnknownSchema<unknown, O>;
    /** Creates an unknown schema with custom value type and options */
    <V = unknown, O extends SchemaOptions<V> = {}>(
        options?: O & SchemaOptions<V>,
    ): UnknownSchema<V, SchemaOptionsSimlify<O>>;
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
export const unknown = defineSchema<UnknownSchemaBase>({
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
