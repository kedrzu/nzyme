import type { FunctionParams } from '@nzyme/types';
import { createNamedFunction, identity } from '@nzyme/utils';

import type {
    SchemaAny,
    SchemaBase,
    SchemaDefault,
    SchemaOptions,
    SchemaOptionsAny,
    SchemaProtoAny,
} from './Schema.js';

type SchemaDefinition<
    F extends SchemaBase = SchemaBase,
    O extends SchemaOptionsAny = SchemaOptions,
> = {
    name: string;
    options?: SchemaOptionsFactory<F>;
    proto: SchemaProtoFactory<O>;
};

type SchemaOptionsFactory<F extends SchemaBase = SchemaBase> = (
    ...args: FunctionParams<F>
) => SchemaOptionsAny;

type SchemaProtoFactory<O extends SchemaOptionsAny = SchemaOptions> = (
    options: O,
) => SchemaProtoAny;

/**
 * Define a new schema.
 */
export function defineSchema<F extends SchemaBase, O extends SchemaOptionsAny = SchemaOptions>(
    definition: SchemaDefinition<F, O>,
) {
    const optionsFactory = (definition.options ?? identity) as SchemaOptionsFactory<F>;
    const protoFactory = definition.proto;
    const SchemaBase: SchemaBase = createNamedFunction(definition.name, (...args) => {
        const options = optionsFactory(...(args as FunctionParams<F>)) ?? ({} as O);
        const schema: SchemaAny = {
            ...options,
            default: wrapDefault(options.default),
            nullable: options.nullable ?? false,
            optional: options.optional ?? false,
            validators: (options.validators ?? []) as SchemaAny['validators'],
            type: SchemaBase,
            proto: protoFactory(options as O) as SchemaAny['proto'],
        };

        return schema;
    });

    return SchemaBase as F;
}

function wrapDefault<T>(def: SchemaDefault<T> | undefined): (() => T) | undefined {
    if (def !== undefined && typeof def !== 'function') {
        return () => def;
    }

    return def as (() => T) | undefined;
}
