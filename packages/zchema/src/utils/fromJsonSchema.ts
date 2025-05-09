import type { JSONSchema7 } from 'json-schema';

import type { Primitive } from '@nzyme/types';
import { assert, mapObject } from '@nzyme/utils';

import type { Schema, SchemaOptionsBase } from '../Schema.js';
import { array } from '../schemas/array.js';
import { boolean } from '../schemas/boolean.js';
import { enumSchema } from '../schemas/enum.js';
import { integer } from '../schemas/integer.js';
import { number } from '../schemas/number.js';
import { object } from '../schemas/object.js';
import { string } from '../schemas/string.js';
import { tuple } from '../schemas/tuple.js';
import { unknown } from '../schemas/unknown.js';

/**
 *
 */
export type FromJsonSchemaOptions = {
    /**
     *
     */
    optional?: boolean;
};

/**
 *
 */
export function fromJsonSchema(schema: JSONSchema7, options: FromJsonSchemaOptions = {}): Schema {
    if (schema.enum) {
        return enumSchema({
            ...schemaProps(schema, options),
            values: schema.enum as Primitive[],
        });
    }

    switch (schema.type) {
        case 'array':
            if (Array.isArray(schema.items)) {
                return tuple({
                    ...schemaProps(schema, options),
                    of: schema.items.map(item =>
                        fromJsonSchema(item as JSONSchema7, {
                            optional: false,
                        }),
                    ),
                });
            }

            return array({
                ...schemaProps(schema, options),
                of: schema.items ? fromJsonSchema(schema.items as JSONSchema7, options) : unknown(),
            });

        case 'boolean':
            return boolean(schemaProps(schema, options));

        case 'integer':
            return integer(schemaProps(schema, options));

        case 'null':
            return unknown(schemaProps(schema, options));

        case 'number':
            return number(schemaProps(schema, options));

        case 'object':
            assert(schema.properties, 'properties is required for object schema');
            return object({
                ...schemaProps(schema, options),
                props: mapObject(schema.properties, (prop, key) => {
                    const propSchema = fromJsonSchema(prop as JSONSchema7, {
                        optional: !schema.required?.includes(key as string),
                    });

                    return propSchema;
                }),
            });

        case 'string':
            return string(schemaProps(schema, options));

        default:
            throw new Error(`Unsupported schema type: ${String(schema.type)}`);
    }
}

function schemaProps(schema: JSONSchema7, options: FromJsonSchemaOptions) {
    const meta: Record<string, unknown> = {};
    const props: Record<string, unknown> & SchemaOptionsBase = {
        nullable:
            schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null')),
        optional: options.optional,
        meta,
    };

    if (schema.description) {
        meta.description = schema.description;
    }

    if (schema.title) {
        meta.name = schema.title;
    }

    return props;
}
