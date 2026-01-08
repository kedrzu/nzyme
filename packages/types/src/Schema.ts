import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Infers the input type of a standard schema.
 */
export type SchemaInput<S extends StandardSchemaV1> = S extends StandardSchemaV1<infer TIn, unknown> ? TIn : never;

/**
 * Infers the output type of a standard schema.
 */
export type SchemaOutput<S extends StandardSchemaV1> = S extends StandardSchemaV1<unknown, infer TOut> ? TOut : never;
