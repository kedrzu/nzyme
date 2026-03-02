import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaAny,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
} from '../Schema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

/**
 * Options for defining a record schema.
 * @template T - The type of schema for record values
 */
export type RecordOptions<T extends SchemaAny = SchemaAny> = {
    /** Schema that defines the type of record values */
    of: T;
};

/**
 * Schema type for records.
 * @template O - Record schema options type
 */
export type RecordSchema<O extends SchemaOptionsBase<RecordOptions> = SchemaOptionsBase<RecordOptions>> = Schema<
    RecordValue<Infer<O['of']>>,
    O
> & {
    /**
     *
     */
    of: O['of'];
};

/**
 * Value type for records (string-keyed object).
 * @template T - The type of values in the record
 */
export type RecordValue<T = unknown> = Record<string, T | undefined>;

/**
 * Base type for record schema definition.
 */
type RecordSchemaConstructor = {
    /** Creates a record schema with a schema for values */
    <S extends SchemaAny>(of: S): RecordSchema<{ of: S }>;

    /** Creates a record schema with custom options */
    <
        S extends SchemaAny,
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<RecordValue<Infer<S>>, TNullable, TOptional, TMeta, RecordOptions<S>>,
    ): RecordSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, RecordOptions<S>>>;
};

/**
 * Creates a schema for record objects (string-keyed dictionaries).
 * This schema validates that a value is an object where all values conform to the specified schema.
 *
 * @example
 * ```ts
 * const stringRecord = record(string());
 * const numberRecord = record(number());
 * const customRecord = record({
 *   of: boolean(),
 *   default: () => ({ active: true, visible: false })
 * });
 * ```
 */
export const record = defineSchema<RecordSchemaConstructor, SchemaOptionsBase<RecordOptions>>({
    name: 'record',
    options: (optionsOrSchema: RecordOptions | SchemaAny) => {
        const options: SchemaOptionsBase<RecordOptions> = isSchema(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const itemSchema = options.of;

        const proto: SchemaProto<RecordValue> = {
            coerce(value) {
                const result: RecordValue = {};

                for (const [key, item] of Object.entries(value as object)) {
                    result[key] = coerce(itemSchema, item);
                }

                return result;
            },
            serialize(value) {
                const result: RecordValue = {};

                for (const [key, item] of Object.entries(value as object)) {
                    result[key] = serialize(itemSchema, item);
                }

                return result;
            },
            check(value): value is RecordValue {
                return typeof value === 'object' && value !== null;
            },
            default: () => ({}),
            visit(value, visitor) {
                for (const [key, item] of Object.entries(value as object)) {
                    visitor(itemSchema, item, key);
                }
            },
        };

        return proto;
    },
});
