import type { SchemaAny } from '../Schema.js';
import type { Extend } from './extend.js';

/**
 * Type representing a schema that cannot be null.
 * @template S - The base schema type
 */
export type NonNullable<S extends SchemaAny> = Extend<S, { nullable: false }> & ForceName;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a new schema that cannot be null from an existing schema.
 * @template S - The base schema type
 * @param schema - The schema to make non-nullable
 * @returns A new schema that cannot be null
 */
export function nonNullable<S extends SchemaAny>(schema: S) {
    return {
        ...schema,
        nullable: false,
    } as NonNullable<S>;
}
