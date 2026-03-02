import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';

/**
 * Schema type for bigint values.
 * @template O - Schema options type
 */
export type BigintSchema<O extends SchemaOptionsBase = SchemaOptionsBase> = Schema<bigint, O>;

/**
 * Prototype implementation for bigint schema.
 */
const proto: SchemaProto<bigint> = {
    coerce: BigInt as (value: unknown) => bigint,
    serialize: String,
    check: value => typeof value === 'bigint',
    default: () => 0n,
};

/**
 * Base type for bigint schema definition.
 */
export type BigintSchemaConstructor = {
    /** Creates a bigint schema with default options */
    (): BigintSchema<{}>;
    /** Creates a bigint schema with custom options */
    <
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<bigint, TNullable, TOptional, TMeta>,
    ): BigintSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
};

/**
 * Creates a schema for bigint values.
 *
 * @example
 * ```ts
 * const id = bigint();
 * const requiredId = bigint({ required: true });
 * const defaultId = bigint({ default: () => 0n });
 * ```
 */
export const bigint = defineSchema<BigintSchemaConstructor>({
    name: 'bigint',
    proto: () => proto,
});
