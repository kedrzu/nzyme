import type { SchemaAny, Infer } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

export function serialize<S extends SchemaAny>(schema: S, value: Infer<S>): unknown {
    lazyResolve(schema);

    const proto = schema.proto;

    if (value === null && schema.nullable) {
        return null;
    }

    if (value === undefined && schema.optional) {
        return undefined;
    }

    return proto.serialize(value);
}
