import type { Primitive } from '@nzyme/types';

import { defineSchema } from '../defineSchema.js';
import type { Schema, SchemaConfigBase, SchemaConfigSimplify, SchemaOptions } from '../Schema.js';

/**
 * Options for defining a constant schema.
 * @template V - The primitive value type
 */
export type ConstSchemaOptions<
    V extends Primitive = Primitive,
    TNullable extends boolean = boolean,
    TOptional extends boolean = boolean,
    TMeta extends object | undefined = object | undefined,
> = SchemaOptions<V, TNullable, TOptional, TMeta> & {
    /** Default value is not allowed for constant schemas */
    default?: undefined;
    /** The constant value that this schema will match */
    value: V;
};

/**
 * Custom options for a constant schema.
 */
export type ConstSchemaOpts<V extends Primitive = Primitive> = {
    /** The constant value that this schema will match */
    value: V;
};

/**
 * Schema type for constant values.
 * @template V - The primitive value type
 * @template O - Schema options type
 */
export type ConstSchema<
    O extends SchemaConfigBase<ConstSchemaOpts> = SchemaConfigBase<ConstSchemaOpts>,
> = ForceName &
    Schema<O extends { value: infer V extends Primitive } ? V : never, O> & {
        /**
         * The constant value that this schema will match
         */
        value: O['value'];
    };

/**
 * Base type for constant schema definition.
 */
type ConstSchemaBase = {
    /** Creates a constant schema with a primitive value */
    <V extends Primitive>(value: V): ConstSchema<{ value: V }>;
    /** Creates a constant schema with custom options */
    <
        V extends Primitive,
        TNullable extends boolean = false,
        TOptional extends boolean = false,
        TMeta extends object | undefined = undefined,
    >(
        options: ConstSchemaOptions<V, TNullable, TOptional, TMeta>,
    ): ConstSchema<SchemaConfigSimplify<TNullable, TOptional, TMeta, { value: V }>>;
};

// Helper type to force type name preservation
declare class ForceName {}

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
    options: (value: ConstSchemaOptions | Primitive) => {
        if (typeof value === 'object') {
            return value;
        }

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
