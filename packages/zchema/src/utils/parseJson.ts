import type { Infer, Schema } from '../Schema.js';
import { coerce } from './coerce.js';

/**
 * Parses a JSON string into a value according to a schema.
 * @template S - The schema type to parse against
 * @param schema - The schema to validate and coerce the parsed value against
 * @param json - The JSON string to parse, or null/undefined to use the schema's default value
 * @returns The parsed and coerced value according to the schema
 * @throws {SyntaxError} If the JSON string is invalid and cannot be parsed
 */
export function parseJson<S extends Schema>(schema: S, json: string | null | undefined): Infer<S> {
    if (!json) {
        return coerce(schema);
    }

    try {
        const value: unknown = JSON.parse(json);
        return coerce(schema, value);
    } catch {
        return coerce(schema);
    }
}
