import { defineSchema } from '../defineSchema.js';
import type {
    Schema,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaMeta,
    SchemaOptions,
    SchemaProto,
} from '../Schema.js';

/**
 * Schema type for void values.
 * @template O - Schema options type
 */
export type VoidSchema<O extends SchemaOptionsBase = SchemaOptionsBase> = ForceName & Schema<void, O>;

/**
 * Internal class used to force type names in TypeScript.
 * @internal
 */
declare class ForceName {}

/**
 * Prototype implementation for void schema.
 * This prototype only accepts undefined values and always returns undefined.
 */
const proto: SchemaProto<void> = {
    coerce: () => undefined,
    serialize: () => undefined,
    check(value): value is void {
        return value === undefined;
    },
    default: () => undefined,
};

/**
 * Base type for void schema definition.
 * Provides overloads for creating void schemas with different options.
 */
export type VoidSchemaConstructor = {
    /** Creates a void schema with default options */
    (): VoidSchema<{}>;
    /** Creates a void schema with custom options */
    <
        TNullable extends boolean = false,
        TOptional extends boolean = true,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options?: SchemaOptions<void, TNullable, TOptional, TMeta>,
    ): VoidSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta>>;
};

/**
 * Creates a schema for void values.
 * This schema matches undefined values and is useful for representing functions that don't return a value.
 * By default, it is optional.
 *
 * @example
 * ```ts
 * const noReturn = voidSchema();
 * const requiredVoid = voidSchema({ required: true });
 * ```
 */
export const voidSchema = defineSchema<VoidSchemaConstructor>({
    name: 'void',
    options: (options?: SchemaOptions<void>) => ({
        ...options,
        optional: true,
    }),
    proto: () => proto,
});
