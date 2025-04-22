import type * as z from '@nzyme/zchema';

/**
 * Type alias for a non-nullable object schema or undefined.
 */
export type ObjectSchema = z.NonNullish<z.ObjectSchema> | undefined;

/**
 * Type alias for object options which can be a non-nullable object schema,
 * object schema properties, or undefined.
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
 *
 * - If T is any object options, it returns unknown
 * - If T is a schema, it returns the inferred type of that schema
 * - If T is object schema properties, it returns the inferred value of those properties
 * - If T is undefined, it returns undefined
 *
 * @template T - The object options type to extract a value from
 */
export type ValueFromOptions<T extends ObjectOptions = ObjectOptions> = ObjectOptions extends T
    ? unknown
    : T extends z.NonNullish<z.ObjectSchema>
      ? z.Infer<T>
      : T extends z.ObjectSchemaProps
        ? z.ObjectSchemaPropsValue<T>
        : undefined;

/**
 * Utility type that extracts the value type from a schema or returns undefined.
 *
 * @template T - The schema type to extract a value from
 */
export type ValueFromSchema<T extends z.Schema | undefined> = T extends z.Schema
    ? z.Infer<T>
    : undefined;
