import { isPlainObject } from '@nzyme/utils';

import { defineSchema } from '../defineSchema.js';
import type {
    Infer,
    Schema,
    SchemaConfigBase,
    SchemaConfigSimplify,
    SchemaOptions,
    SchemaProto,
} from '../Schema.js';
import { isSchema } from '../utils/isSchema.js';
import type { ConstSchema } from './const.js';
import { constSchema } from './const.js';
import type { ObjectSchema } from './object.js';

/**
 * Options for defining a union schema.
 * @template T - Array of schemas that form the union
 */
export type ObjectUnionOptions<T extends ObjectSchema[] = ObjectSchema[]> = {
    /** Discriminator key */
    discriminator: ObjectSchema[] extends T
        ? string
        : keyof ObjectDiscriminatorProps<T[number]> & string;
    /** Array of schemas that form the union */
    of: T;
};

/**
 * Schema type for union values.
 * @template O - ObjectUnion schema options type
 */
export type ObjectUnionSchema<
    O extends SchemaConfigBase<ObjectUnionOptions> = SchemaConfigBase<ObjectUnionOptions>,
> = Schema<ObjectUnionValue<O>, O> & {
    /**
     *
     */
    discriminator: O['discriminator'];
    /**
     *
     */
    of: O['of'];
};

/**
 *
 */
export type ObjectUnionValue<O extends ObjectUnionOptions> = Infer<O['of'][number]>;

type ObjectDiscriminatorProps<T extends ObjectSchema> = {
    [K in keyof T['props'] as T['props'][K] extends ConstSchema ? K : never]: T['props'][K];
};

/**
 * Base type for union schema definition.
 */
type ObjectUnionSchemaConstructor = {
    /** Creates a union schema with custom options */
    <
        S extends ObjectSchema[],
        TNullable extends boolean | undefined = undefined,
        TOptional extends boolean | undefined = undefined,
        TMeta extends object | undefined = undefined,
    >(
        options: SchemaOptions<
            Infer<S[number]>,
            TNullable,
            TOptional,
            TMeta,
            ObjectUnionOptions<S>
        >,
    ): ObjectUnionSchema<SchemaConfigSimplify<TNullable, TOptional, TMeta, ObjectUnionOptions<S>>>;
};

export /**
 *
 */
const objectUnion = defineSchema<
    ObjectUnionSchemaConstructor,
    SchemaConfigBase<ObjectUnionOptions>
>({
    name: 'union',
    proto: options => {
        const schemas = options.of;
        const schemasPerDiscriminator = new Map<unknown, ObjectSchema>();
        const discriminator = options.discriminator;

        for (const schema of schemas) {
            const discriminatorProp = schema.props[discriminator];
            if (discriminatorProp === undefined) {
                throw new Error(`Discriminator ${discriminator} is not defined in schema`);
            }

            if (!isSchema(discriminatorProp, constSchema)) {
                throw new Error(`Discriminator ${discriminator} is not a constant schema`);
            }

            schemasPerDiscriminator.set(discriminatorProp.value, schema);
        }

        const proto: SchemaProto<unknown> = {
            coerce(value, ctx) {
                const discriminatorValue = (value as Record<string, unknown>)[discriminator];
                const schema = schemasPerDiscriminator.get(discriminatorValue);

                return schema?.proto.coerce(value, ctx);
            },
            serialize(value, ctx) {
                const discriminatorValue = (value as Record<string, unknown>)[discriminator];
                const schema = schemasPerDiscriminator.get(discriminatorValue);

                return schema?.proto.serialize(value, ctx);
            },
            check(value): value is object {
                if (!isPlainObject(value)) {
                    return false;
                }

                const discriminatorValue = value[discriminator];
                const schema = schemasPerDiscriminator.get(discriminatorValue);

                return schema !== undefined;
            },
            default: () => [],
            visit(value, visitor, ctx) {
                const discriminatorValue = (value as Record<string, unknown>)[discriminator];
                const schema = schemasPerDiscriminator.get(discriminatorValue);

                if (schema === undefined) {
                    // TODO: Return error
                    return;
                }

                schema.proto.visit?.(value, visitor, ctx);
            },
        };

        return proto;
    },
});
