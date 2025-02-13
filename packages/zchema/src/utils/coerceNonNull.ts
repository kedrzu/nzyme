import type { Schema, SchemaProto, InferNonNull } from '../Schema.js';

export function coerceNonNull<S extends Schema>(schema: S, value?: unknown): InferNonNull<S> {
    const proto = schema.proto as SchemaProto<InferNonNull<S>>;

    if (value === null) {
        if (schema.default) {
            return schema.default() as InferNonNull<S>;
        }

        return proto.default();
    }

    if (value === undefined) {
        if (schema.default) {
            return schema.default() as InferNonNull<S>;
        }

        return proto.default();
    }

    const result = proto.coerce(value);
    if (result === undefined) {
        throw new Error('Invalid value');
    }

    return result;
}
