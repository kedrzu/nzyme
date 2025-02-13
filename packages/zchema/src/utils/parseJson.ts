import { coerce } from './coerce.js';
import type { Schema, Infer } from '../Schema.js';

export function parseJson<S extends Schema>(schema: S, json: string | undefined | null): Infer<S> {
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
