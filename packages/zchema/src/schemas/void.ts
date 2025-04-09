import type { Schema, SchemaOptions, SchemaOptionsSimlify, SchemaProto } from '../Schema.js';
import { defineSchema } from '../defineSchema.js';

/**
 * Type of the schema that matches `void`.
 */
export type VoidSchema<O extends SchemaOptions<void> = SchemaOptions<void>> = ForceName<
    Schema<void, O>
>;

declare class FF {}
type ForceName<T> = T & FF;

const proto: SchemaProto<void> = {
    coerce: () => undefined,
    serialize: () => undefined,
    check(value): value is void {
        return value === undefined;
    },
    default: () => undefined,
};

type VoidSchemaBase = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    <O extends SchemaOptions<void> = {}>(
        options?: O & SchemaOptions<void>,
    ): VoidSchema<SchemaOptionsSimlify<O>>;
};

/**
 * Create a schema that matches `void`.
 */
export const voidSchema = defineSchema<VoidSchemaBase>({
    name: 'void',
    options: (options?: SchemaOptions<void>) => ({
        ...options,
        optional: true,
    }),
    proto: () => proto,
});
