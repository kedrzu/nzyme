import type { Infer, SchemaAny, SchemaContext } from '../Schema.js';
import { DEFAULT_SCHEMA_CONTEXT } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

/**
 * Serializes a value according to a schema's serialization rules.
 * @template S - The schema type
 * @param schema - The schema to use for serialization
 * @param value - The value to serialize
 * @param context - The schema context to use for serialization
 * @returns The serialized value, which may be null or undefined if the schema allows it
 */
export function serialize<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    context: SchemaContext = DEFAULT_SCHEMA_CONTEXT,
): unknown {
    lazyResolve(schema);

    const proto = schema.proto;

    if (value === null && schema.nullable) {
        return null;
    }

    if (value === undefined && schema.optional) {
        return undefined;
    }

    return proto.serialize(value, context);
}
