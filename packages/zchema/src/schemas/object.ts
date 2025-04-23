import type { Flatten } from '@nzyme/types';
import { isPlainObject } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaAny,
    SchemaConfigBase,
    SchemaConfigSimplify,
    SchemaOptions,
    SchemaProto,
    SchemaVisitor,
} from '../Schema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

/**
 *
 */
export type ObjectSchemaProps = {
    [key: string]: SchemaAny;
};

/**
 *
 */
export type ObjectSchemaPropsValue<TProps extends ObjectSchemaProps> = Flatten<
    {
        [K in keyof TProps as TProps[K]['optional'] extends false ? K : never]: Infer<TProps[K]>;
    } & {
        [K in keyof TProps as TProps[K]['optional'] extends false ? never : K]+?: Infer<TProps[K]>;
    }
>;

/**
 *
 */
export type ObjectOptions<TProps extends ObjectSchemaProps = ObjectSchemaProps> = {
    /**
     *
     */
    props: TProps;
};

/**
 *
 */
export type ObjectSchema<
    O extends SchemaConfigBase<ObjectOptions> = SchemaConfigBase<ObjectOptions>,
> = ForceName &
    Schema<ObjectSchemaValue<O>, O> & {
        /**
         *
         */
        props: O['props'];
    };

/**
 *
 */
export type ObjectSchemaAny = SchemaAny & {
    /**
     *
     */
    props: ObjectSchemaProps;
};

/**
 *
 */
export type ObjectSchemaValue<O extends ObjectOptions> = ObjectSchemaPropsValue<O['props']>;

/**
 *
 */
export type ObjectSchemaConstructor = {
    <
        P extends ObjectSchemaProps,
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends object | undefined = undefined,
    >(
        options: SchemaOptions<
            ObjectSchemaPropsValue<P>,
            TNullable,
            TOptional,
            TMeta,
            ObjectOptions<P>
        >,
    ): ObjectSchema<SchemaConfigSimplify<TNullable, TOptional, TMeta, ObjectOptions<P>>>;

    <P extends ObjectSchemaProps>(props: P): ObjectSchema<{ props: P }>;
};

declare class ForceName {}

/**
 *
 */
export const object = defineSchema<ObjectSchemaConstructor, SchemaConfigBase<ObjectOptions>>({
    name: 'object',
    options: (optionsOrProps: ObjectOptions | ObjectSchemaProps) => {
        const options =
            optionsOrProps.props && !isSchema(optionsOrProps.props)
                ? optionsOrProps
                : { props: optionsOrProps };

        return options as SchemaConfigBase<ObjectOptions>;
    },
    proto: options => {
        const props: [name: string, schema: Schema][] = [];
        /**
         *
         */
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
