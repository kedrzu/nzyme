import { expect, test } from 'vitest';

import * as s from '../index.js';

test('basic object', () => {
    const schema = s.fromJsonSchema({
        title: 'Example Schema',
        type: 'object',
        properties: {
            firstName: {
                type: 'string',
            },
            lastName: {
                $id: 'lastName',
                type: 'string',
            },
            age: {
                description: 'Age in years',
                type: 'integer',
                minimum: 0,
            },
            height: {
                $id: 'height',
                type: 'number',
            },
            favoriteFoods: {
                type: 'array',
            },
            likesDogs: {
                type: 'boolean',
            },
        },
        required: ['firstName', 'lastName'],
    });

    const expected = {
        nullable: false,
        optional: false,
        default: undefined,
        validate: [],
        proto: expect.any(Object) as object,
        type: s.object,
        meta: { name: 'Example Schema' },
        props: {
            firstName: {
                nullable: false,
                optional: false,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.string,
                meta: {},
            },
            lastName: {
                nullable: false,
                optional: false,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.string,
                meta: {},
            },
            age: {
                nullable: false,
                optional: true,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.integer,
                meta: { description: 'Age in years' },
            },
            height: {
                nullable: false,
                optional: true,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.number,
                meta: {},
            },
            favoriteFoods: {
                nullable: false,
                optional: true,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.array,
                of: {
                    default: undefined,
                    nullable: true,
                    optional: true,
                    validate: [],
                    proto: expect.any(Object) as object,
                    type: s.unknown,
                    meta: {},
                },
                meta: {},
            },
            likesDogs: {
                nullable: false,
                optional: true,
                default: undefined,
                validate: [],
                proto: expect.any(Object) as object,
                type: s.boolean,
                meta: {},
            },
        },
    };

    expect(schema).toEqual(expected);
});
