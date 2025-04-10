import { identity } from '@nzyme/utils';

import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Schema type for unknown values.
 * @template V - Value type
 * @template O - Schema options type
 */
export type UnknownSchema<V, O extends SchemaOptions<V>> = ForceName<Schema<V, O>>;

// Helper type to force type name preservation
declare class FF {}
type ForceName<T> = T & FF;

/**
 * Protocol implementation for unknown schema.
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
