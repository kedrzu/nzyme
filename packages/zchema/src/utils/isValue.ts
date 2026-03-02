import { DEFAULT_SCHEMA_CONTEXT } from '../Schema.js';
import type { Schema, SchemaContext } from '../Schema.js';

/**
 * Checks if the value is of the given schema type.
 *
 * @param value - The value to check.
 * @param schema - The schema to check against.
 * @returns `true` if the value is of the given schema type, `false` otherwise.
 */
export function isValue<T>(value: unknown, schema: Schema<T>, ctx: SchemaContext = DEFAULT_SCHEMA_CONTEXT): value is T {
    return schema.proto.check(value, ctx);
}
