import type { SchemaAny } from '../Schema.js';
import type { Extend } from './extend.js';

/**
 * Type representing a schema that can be undefined.
 * @template S - The base schema type
 */
export type Optional<S extends SchemaAny> = Extend<S, { optional: true }> & ForceName;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a new schema that can be undefined from an existing schema.
 * @template S - The base schema type
 * @param schema - The schema to make optional
 * @returns A new schema that can be undefined
 */
export function optional<S extends SchemaAny>(schema: S) {
    return {
        ...schema,
        optional: true,
    } as Optional<S>;
}
