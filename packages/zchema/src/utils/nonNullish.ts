import type { SchemaAny } from '../Schema.js';
import type { Extend } from './extend.js';

/**
 * Type representing a schema that cannot be null or undefined.
 * @template S - The base schema type
 */
export type NonNullish<S extends SchemaAny> = Extend<S, { nullable: false; optional: false }> &
    ForceName;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a new schema that cannot be null or undefined from an existing schema.
 * @template S - The base schema type
 * @param schema - The schema to make non-nullish
 * @returns A new schema that cannot be null or undefined
 */
export function nonNullish<S extends SchemaAny>(schema: S) {
    return {
        ...schema,
        nullable: false,
        optional: false,
    } as NonNullish<S>;
}
