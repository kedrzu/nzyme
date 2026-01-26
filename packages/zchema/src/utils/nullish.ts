import type { SchemaAny } from '../Schema.js';
import type { Extend } from './extend.js';

/**
 * Type representing a schema that can be null or undefined.
 * @template S - The base schema type
 */
export type Nullish<S extends SchemaAny> = Extend<S, { nullable: true; optional: true }> & ForceName;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Creates a new schema that can be null or undefined from an existing schema.
 * @template S - The base schema type
 * @param schema - The schema to make nullish
 * @returns A new schema that can be null or undefined
 */
export function nullish<S extends SchemaAny>(schema: S) {
    return {
        ...schema,
        nullable: true,
        optional: true,
    } as Nullish<S>;
}
