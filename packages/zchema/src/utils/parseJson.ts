import { DEFAULT_SCHEMA_CONTEXT, type Infer, type Schema, type SchemaContext } from '../Schema.js';
import { coerce } from './coerce.js';

/**
 * Parses a JSON string into a value according to a schema.
 * @template S - The schema type to parse against
 * @param schema - The schema to validate and coerce the parsed value against
 * @param json - The JSON string to parse, or null/undefined to use the schema's default value
 * @param context - The schema context to use for parsing
 * @returns The parsed and coerced value according to the schema
 * @throws {SyntaxError} If the JSON string is invalid and cannot be parsed
 */
export function parseJson<S extends Schema>(
    schema: S,
    json: string | null | undefined,
    context: SchemaContext = DEFAULT_SCHEMA_CONTEXT,
): Infer<S> {
    if (!json) {
        return coerce(schema, undefined, context);
    }

    try {
        const value: unknown = JSON.parse(json);
        return coerce(schema, value, context);
    } catch {
        return coerce(schema, undefined, context);
    }
}
