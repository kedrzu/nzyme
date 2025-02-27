import type { Schema, SchemaProto, Infer, InferNonNull } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

export function coerce<S extends Schema>(schema: S, value: Partial<Infer<S>>): Infer<S>;
export function coerce<S extends Schema>(schema: S, value?: unknown): Infer<S>;
export function coerce<S extends Schema>(schema: S, value?: unknown): Infer<S> {
    lazyResolve(schema);

    const proto = schema.proto as SchemaProto<InferNonNull<S>>;

    if (value === null) {
        if (schema.nullable) {
            return null as Infer<S>;
        }

        if (schema.default) {
            return schema.default() as Infer<S>;
        }

        if (schema.optional) {
            return undefined as Infer<S>;
        }

        return proto.default();
    }

    if (value === undefined) {
        if (schema.optional) {
            return undefined as Infer<S>;
        }

        if (schema.default) {
            return schema.default() as Infer<S>;
        }

        if (schema.nullable) {
            return null as Infer<S>;
        }

        return proto.default();
    }

    const result = proto.coerce(value);
    if (result === undefined) {
        throw new Error('Invalid value');
    }

    return result;
}
