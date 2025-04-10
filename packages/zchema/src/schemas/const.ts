import type { Primitive } from '@nzyme/types';

import type { Schema, SchemaOptions } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Options for defining a constant schema.
 * @template V - The primitive value type
 */
export type ConstSchemaOptions<V extends Primitive = Primitive> = SchemaOptions<V> & {
    /** The constant value that this schema will match */
    value: V;
    /** Default value is not allowed for constant schemas */
    default?: undefined;
};

/**
 * Schema type for constant values.
 * @template O - Constant schema options type
 */
export type ConstSchema<O extends ConstSchemaOptions> = ForceName<Schema<O['value'], O>>;

// Helper type to force type name preservation
declare class FF {}
type ForceName<T> = T & FF;

/**
 * Base type for constant schema definition.
 */
type ConstSchemaBase = {
    /** Creates a constant schema with a primitive value */
    <V extends Primitive>(value: V): ConstSchema<{ value: V }>;
};

/**
 * Creates a schema for constant values.
 * This schema matches only the exact value it was created with.
 *
 * @example
 * ```ts
 * const trueConst = constSchema(true);
 * const numberConst = constSchema(42);
 * const stringConst = constSchema('hello');
 * ```
 */
export const constSchema = defineSchema<ConstSchemaBase, ConstSchemaOptions>({
    name: 'const',
    options: (value: Primitive) => {
        const options: ConstSchemaOptions = {
            value,
        };

        return options;
    },
    proto: (options: ConstSchemaOptions) => {
        const value = options.value;
        const getter = () => value;

        return {
            coerce: getter,
            serialize: getter,
            check: (v): v is Primitive => v === value,
            default: getter,
        };
    },
});
