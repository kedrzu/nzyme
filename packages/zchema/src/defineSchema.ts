import type { FunctionParams } from '@nzyme/types';
import { asArray, createNamedFunction, identity } from '@nzyme/utils';

import type {
    Schema,
    SchemaAny,
    SchemaBase,
    SchemaDefault,
    SchemaOptions,
    SchemaOptionsAny,
    SchemaProtoAny,
} from './Schema.js';

/**
 * Type definition for schema creation with factory functions for options and prototype.
 * @template F - The base schema type
 * @template O - The schema options type
 */
type SchemaDefinition<
    F extends SchemaBase = SchemaBase,
    O extends SchemaOptionsAny = SchemaOptions,
> = {
    /** The name of the schema */
    name: string;
    /** Optional factory function to create schema options */
    options?: SchemaOptionsFactory<F>;
    /** Factory function to create schema prototype */
    proto: SchemaProtoFactory<O>;
};

/**
 * Factory function type for creating schema options
 * @template F - The base schema type
 */
type SchemaOptionsFactory<F extends SchemaBase = SchemaBase> = (
    ...args: FunctionParams<F>
) => SchemaOptionsAny;

/**
 * Factory function type for creating schema prototype
 * @template O - The schema options type
 */
type SchemaProtoFactory<O extends SchemaOptionsAny = SchemaOptions> = (
    options: O,
) => SchemaProtoAny;

/**
 * Creates a new schema definition with the specified name, options factory, and prototype factory.
 * @template F - The base schema type
 * @template O - The schema options type
 * @param definition - The schema definition containing name, options factory, and prototype factory
 * @returns A schema factory function that creates schemas with the specified configuration
 * @__NO_SIDE_EFFECTS__
 */
export function defineSchema<F extends SchemaBase, O extends SchemaOptionsAny = SchemaOptions>(
    definition: SchemaDefinition<F, O>,
) {
    const optionsFactory = (definition.options ?? identity) as SchemaOptionsFactory<F>;
    const protoFactory = definition.proto;
    const SchemaBase: SchemaBase = createNamedFunction(definition.name, (...args) => {
        const options = optionsFactory(...(args as FunctionParams<F>)) ?? ({} as O);
        const schema: Schema = {
            ...options,
            default: wrapDefault(options.default),
            nullable: options.nullable ?? false,
            optional: options.optional ?? false,
            validate: asArray(options.validate) as SchemaAny['validate'],
            type: SchemaBase,
            proto: protoFactory(options as O) as SchemaAny['proto'],
            meta: options.meta ?? {},
        };

        return schema;
    });

    return SchemaBase as F;
}

/**
 * Wraps a default value in a function if it's not already a function.
 * @template T - The type of the default value
 * @param def - The default value or function
 * @returns A function that returns the default value, or undefined if no default was provided
 */
function wrapDefault<T>(def: SchemaDefault<T> | undefined): (() => T) | undefined {
    if (def !== undefined && typeof def !== 'function') {
        return (() => def) as () => T;
    }

    return def as (() => T) | undefined;
}
