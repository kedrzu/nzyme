import type { Flatten } from '@nzyme/types';
import { isPlainObject } from '@nzyme/utils';

import type {
    Schema,
    SchemaAny,
    SchemaOptions,
    SchemaOptionsSimlify,
    SchemaProto,
    Infer,
    SchemaVisitor,
} from '../Schema.js';
import { defineSchema } from '../defineSchema.js';
import { coerce } from '../utils/coerce.js';
import { serialize } from '../utils/serialize.js';

export type ObjectSchemaProps = {
    [key: string]: SchemaAny;
};

export type ObjectSchemaPropsValue<TProps extends ObjectSchemaProps> = Flatten<
    {
        [K in keyof TProps as TProps[K]['optional'] extends false ? K : never]: Infer<TProps[K]>;
    } & {
        [K in keyof TProps as TProps[K]['optional'] extends false ? never : K]+?: Infer<TProps[K]>;
    }
>;

export type ObjectSchemaOptions<TProps extends ObjectSchemaProps = ObjectSchemaProps> =
    SchemaOptions<ObjectSchemaPropsValue<TProps>> & {
        props: TProps;
    };

type ObjectSchemaOptionsProps<O extends ObjectSchemaOptions> =
    O extends ObjectSchemaOptions<infer P extends ObjectSchemaProps> ? P : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectSchema<O extends ObjectSchemaOptions = ObjectSchemaOptions> = ForceName<
    O extends ObjectSchemaOptions<infer P extends ObjectSchemaProps>
        ? Schema<ObjectSchemaPropsValue<P>, O>
        : never
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectSchemaAny = Schema<any> & {
    props: ObjectSchemaProps;
};

declare class FF {}
type ForceName<T> = T & FF;

export type ObjectSchemaValue<O extends ObjectSchemaOptions> = ObjectSchemaPropsValue<O['props']>;

type ObjectSchemaBase = {
    <O extends ObjectSchemaOptions>(
        options: O & ObjectSchemaOptions<ObjectSchemaOptionsProps<O>>,
    ): ObjectSchema<SchemaOptionsSimlify<O>>;
};

export const object = defineSchema<ObjectSchemaBase, ObjectSchemaOptions>({
    name: 'object',
    proto: options => {
        const props: [name: string, schema: Schema][] = [];
        type ObjectType = Record<string, unknown>;

        for (const propKey in options.props) {
            const propSchema = options.props[propKey]!;
            props.push([propKey, propSchema]);
        }

        const proto: SchemaProto<ObjectType> = {
            coerce: coerceValue,
            serialize: serializeValue,
            check: checkValue,
            default: defaultValue,
            visit: visitValue,
        };

        return proto;

        function coerceValue(value: unknown) {
            const result: ObjectType = {};

            for (const [propKey, propSchema] of props) {
                const propValue = (value as ObjectType)[propKey];
                result[propKey] = coerce(propSchema, propValue);
            }

            return result;
        }

        function serializeValue(value: ObjectType) {
            const result: ObjectType = {};

            for (const [propKey, propSchema] of props) {
                const propValue = value[propKey];
                result[propKey] = serialize(propSchema, propValue);
            }

            return result;
        }

        function checkValue(value: unknown): value is ObjectType {
            return isPlainObject(value);
        }

        function defaultValue() {
            return coerceValue({});
        }

        function visitValue(value: ObjectType, visitor: SchemaVisitor) {
            for (const [propKey, propSchema] of props) {
                const propValue = value[propKey];
                visitor(propSchema, propValue, propKey);
            }
        }
    },
});
