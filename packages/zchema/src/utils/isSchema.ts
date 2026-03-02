import type { Schema, SchemaBase } from '../Schema.js';

/**
 * Type guard to check if a value is a schema instance.
 * @template V - The value type that the schema validates
 * @param value - The value to check
 * @returns True if the value is a schema instance
 */
export function isSchema<V = unknown>(value: unknown): value is Schema<V>;
/**
 * Type guard to check if a value is a schema instance created by a specific factory.
 * @template F - The schema factory type
 * @param value - The value to check
 * @param factory - The schema factory to check against
 * @returns True if the value is a schema instance created by the specified factory
 */
export function isSchema<F extends SchemaBase>(value: unknown, factory: F): value is ReturnType<F>;
/**
 * Implementation of the isSchema type guard.
 * @param value - The value to check
 * @param factory - Optional schema factory to check against
 * @returns True if the value is a schema instance (and matches the factory if provided)
 */
export function isSchema(value: unknown, factory?: SchemaBase) {
    if (isSchemaBase(value)) {
        if (factory == null) {
            return true;
        }

        return value.type === factory;
    }

    return false;
}

/**
 * Internal type guard to check if a value has the basic structure of a schema.
 * @param value - The value to check
 * @returns True if the value has the basic structure of a schema
 */
function isSchemaBase(value: unknown): value is Schema {
    return value != null && typeof value === 'object' && 'proto' in value;
}
