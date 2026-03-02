import type { InferNonNull, Schema, SchemaContext, SchemaProto } from '../Schema.js';
import { DEFAULT_SCHEMA_CONTEXT } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

/**
 *
 */
export function coerceNonNull<S extends Schema>(
    schema: S,
    value?: unknown,
    context: SchemaContext = DEFAULT_SCHEMA_CONTEXT,
): InferNonNull<S> {
    lazyResolve(schema);

    const proto = schema.proto as SchemaProto<InferNonNull<S>>;

    if (value === null) {
        if (schema.default) {
            return schema.default() as InferNonNull<S>;
        }

        return proto.default(context);
    }

    if (value === undefined) {
        if (schema.default) {
            return schema.default() as InferNonNull<S>;
        }

        return proto.default(context);
    }

    const result = proto.coerce(value, context);
    if (result === undefined) {
        throw new Error('Invalid value');
    }

    return result;
}
