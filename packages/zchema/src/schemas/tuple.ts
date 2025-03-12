import type {
    Schema,
    SchemaAny,
    SchemaOptions,
    SchemaOptionsSimlify,
    SchemaProto,
    Infer,
} from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import { coerce } from '../utils/coerce.js';
import { serialize } from '../utils/serialize.js';

export type TupleSchemaOptions<T extends SchemaAny[] = SchemaAny[]> = SchemaOptions<
    TupleSchemaValue<T>
> & {
    of: T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TupleSchema<O extends TupleSchemaOptions = TupleSchemaOptions> = ForceName<
    O extends TupleSchemaOptions<infer T extends SchemaAny[]>
        ? Schema<TupleSchemaValue<T>, O>
        : never
>;

declare class FF {}
type ForceName<T> = T & FF;

export type TupleSchemaValue<TTuple extends [...SchemaAny[]]> = {
    [K in keyof TTuple]: Infer<TTuple[K]>;
} & { length: TTuple['length'] };

type TupleSchemaBase = {
    <S extends SchemaAny[]>(of: S): TupleSchema<{ of: S }>;
    <O extends TupleSchemaOptions>(
        options: O & TupleSchemaOptions<O['of']>,
    ): TupleSchema<SchemaOptionsSimlify<O>>;
};

export const tuple = defineSchema<TupleSchemaBase, TupleSchemaOptions>({
    name: 'tuple',
    options: (optionsOrSchema: SchemaAny[] | TupleSchemaOptions) => {
        const options: TupleSchemaOptions = Array.isArray(optionsOrSchema)
            ? { of: optionsOrSchema }
            : optionsOrSchema;

        return options;
    },
    proto: options => {
        const of = options.of;

        const proto: SchemaProto<unknown[]> = {
            coerce(value) {
                const result: unknown[] = [];

                if (value == null) {
                    value = [];
                }

                for (let i = 0; i < of.length; i++) {
                    const item = (value as unknown[])[i];
                    result.push(coerce(of[i]!, item));
                }

                return result;
            },
            serialize(value) {
                const result: unknown[] = [];

                for (let i = 0; i < of.length; i++) {
                    result.push(serialize(of[i]!, value[i]));
                }

                return result;
            },
            check(value): value is unknown[] {
                return Array.isArray(value) && value.length === of.length;
            },
            default: () => [],
            visit(value, visitor) {
                for (let i = 0; i < of.length; i++) {
                    visitor(of[i]!, value[i], i);
                }
            },
        };

        return proto;
    },
});
