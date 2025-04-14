import type { Infer, Schema } from '../Schema.js';
import { coerce } from './coerce.js';

/**
 * Parses a JSON string into a value.
 */
export function parseJson<S extends Schema>(schema: S, json: null | string | undefined): Infer<S> {
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
