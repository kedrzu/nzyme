import type { Flatten } from '@nzyme/types/Object.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaAny,
    SchemaMeta,
    SchemaOptions,
    SchemaOptionsBase,
    SchemaOptionsSimplify,
    SchemaProto,
    SchemaVisitor,
} from '../Schema.js';
import { coerce } from '../utils/coerce.js';
import { isSchema } from '../utils/isSchema.js';
import { serialize } from '../utils/serialize.js';

/**
 *
 */
export type ObjectSchemaProps = Record<string, Schema>;

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
export type ObjectSchema<O extends SchemaOptionsBase<ObjectOptions> = SchemaOptionsBase<ObjectOptions>> = ForceName &
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
        TProps extends ObjectSchemaProps,
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends SchemaMeta | undefined = undefined,
    >(
        options: SchemaOptions<ObjectSchemaPropsValue<TProps>, TNullable, TOptional, TMeta, ObjectOptions<TProps>>,
    ): ObjectSchema<SchemaOptionsSimplify<TNullable, TOptional, TMeta, ObjectOptions<TProps>>>;
    <TProps extends ObjectSchemaProps>(props: TProps): ObjectSchema<{ props: TProps }>;
};

declare class ForceName {}

/**
 *
 */
export const object = defineSchema<ObjectSchemaConstructor, SchemaOptionsBase<ObjectOptions>>({
    name: 'object',
    options: (optionsOrProps: ObjectOptions | ObjectSchemaProps) => {
        const options =
            optionsOrProps.props && !isSchema(optionsOrProps.props) ? optionsOrProps : { props: optionsOrProps };

        return options as SchemaOptionsBase<ObjectOptions>;
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
