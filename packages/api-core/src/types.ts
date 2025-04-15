import type * as z from '@nzyme/zchema';

/**
 *
 */
export type ObjectSchema = z.NonNullish<z.ObjectSchema> | undefined;

/**
 *
 */
export type ObjectOptions = z.NonNullish<z.ObjectSchema> | z.ObjectSchemaProps | undefined;

/**
 *
 */
export type SchemaFromOptions<T extends ObjectOptions = ObjectOptions> =
    T extends z.NonNullish<z.ObjectSchema>
        ? T
        : T extends z.ObjectSchemaProps
          ? z.ObjectSchema<{ nullable: false; optional: false; props: T }>
          : undefined;

/**
 *
 */
export type ValueFromOptions<T extends ObjectOptions = ObjectOptions> = ObjectOptions extends T
    ? unknown
    : T extends z.NonNullish<z.ObjectSchema>
      ? z.Infer<T>
      : T extends z.ObjectSchemaProps
        ? z.ObjectSchemaPropsValue<T>
        : undefined;

/**
 *
 */
export type ValueFromSchema<T extends z.Schema | undefined> = T extends z.Schema
    ? z.Infer<T>
    : undefined;
