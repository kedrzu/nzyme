import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Schema type for void values.
 * @template O - Schema options type
 */
export type VoidSchema<O extends SchemaOptions<void> = SchemaOptions<void>> = ForceName<
    Schema<void, O>
>;

// Helper type to force type name preservation
declare class FF {}
type ForceName<T> = T & FF;

/**
 * Protocol implementation for void schema.
 */
const proto: SchemaProto<void> = {
    coerce: () => undefined,
    serialize: () => undefined,
    check(value): value is void {
        return value === undefined;
    },
    default: () => undefined,
};

/**
 * Base type for void schema definition.
 */
type VoidSchemaBase = {
    /** Creates a void schema with custom options */
    <O extends SchemaOptions<void> = {}>(
        options?: O & SchemaOptions<void>,
    ): VoidSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Creates a schema for void values.
 * This schema matches undefined values and is useful for representing functions that don't return a value.
 * By default, it is optional.
 *
 * @example
 * ```ts
 * const noReturn = voidSchema();
 * const requiredVoid = voidSchema({ required: true });
 * ```
 */
export const voidSchema = defineSchema<VoidSchemaBase>({
    name: 'void',
    options: (options?: SchemaOptions<void>) => ({
        ...options,
        optional: true,
    }),
    proto: () => proto,
});
