import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';

/**
 * Schema type for void values.
 * @template O - Schema options type
 */
export type VoidSchema<O extends SchemaOptions<void> = SchemaOptions<void>> = ForceName<
    Schema<void, O>
>;

/**
 * Helper type to force type name preservation.
 * @template T - The type to preserve
 * @internal
 */
type ForceName<T> = FF & T;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class FF {}

/**
 * Prototype implementation for void schema.
 * This prototype only accepts undefined values and always returns undefined.
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
 * Provides overloads for creating void schemas with different options.
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
