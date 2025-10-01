import { DEFAULT_SCHEMA_CONTEXT } from '../Schema.js';
import type { Infer, InferNonNull, Schema, SchemaProto } from '../Schema.js';
import type { SchemaContext } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

/**
 *
 */
export function coerce<S extends Schema>(schema: S, value: Partial<Infer<S>>, context?: SchemaContext): Infer<S>;
/**
 *
 */
export function coerce<S extends Schema>(schema: S, value?: unknown, context?: SchemaContext): Infer<S>;
/**
 *
 */
export function coerce<S extends Schema>(
    schema: S,
    value?: unknown,
    context: SchemaContext = DEFAULT_SCHEMA_CONTEXT,
): Infer<S> {
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

        return proto.default(context);
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

        return proto.default(context);
    }

    const result = proto.coerce(value, context);
    if (result === undefined) {
        throw new Error('Invalid value');
    }

    return result;
}
