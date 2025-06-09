import type * as z from '@nzyme/zchema';

/**
 * Type alias for a non-nullable object schema or undefined.
 * Used throughout the API server for schema validation.
 */
export type ObjectSchema = z.NonNullish<z.ObjectSchema> | undefined;

/**
 * Type alias for object options which can be a non-nullable object schema,
 * object schema properties, or undefined. Provides flexibility in defining validation schemas.
 */
export type ObjectOptions = z.NonNullish<z.ObjectSchema> | z.ObjectSchemaProps | undefined;

/**
 * Utility type that converts ObjectOptions to a proper schema type.
 *
 * - If T is already a schema, it returns T
 * - If T is object schema properties, it wraps them in an object schema
 * - If T is undefined, it returns undefined
 *
 * @template T - The object options type to convert
 */
export type SchemaFromOptions<T extends ObjectOptions = ObjectOptions> =
    T extends z.NonNullish<z.ObjectSchema>
        ? T
        : T extends z.ObjectSchemaProps
          ? z.ObjectSchema<{ nullable: false; optional: false; props: T }>
          : undefined;

/**
 * Utility type that extracts the value type from ObjectOptions.
 * Used to determine the TypeScript type corresponding to a schema definition.
 *
 * @template T - The object options type to extract a value from
 */
export type ValueFromOptions<T extends ObjectOptions = ObjectOptions> =
    T extends z.NonNullish<z.ObjectSchema>
        ? z.Infer<T>
        : T extends z.ObjectSchemaProps
          ? z.ObjectSchemaPropsValue<T>
          : undefined;

/**
 * Utility type that extracts the value type from a schema or returns undefined.
 * Used to infer the TypeScript type from a schema for endpoint input/output validation.
 *
 * @template T - The schema type to extract a value from
 */
export type ValueFromSchema<T extends z.Schema | undefined> = T extends z.Schema
    ? z.Infer<T>
    : undefined;
