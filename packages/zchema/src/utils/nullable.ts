import type { SchemaAny } from '../Schema.js';
import type { Extend } from './extend.js';

/**
 * Type representing a schema that can be null.
 * @template S - The base schema type
 */
export type Nullable<S extends SchemaAny> = Extend<S, { nullable: true }> & ForceName;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a new schema that can be null from an existing schema.
 * @template S - The base schema type
 * @param schema - The schema to make nullable
 * @returns A new schema that can be null
 */
export function nullable<S extends SchemaAny>(schema: S) {
    return {
        ...schema,
        nullable: true,
    } as Nullable<S>;
}
