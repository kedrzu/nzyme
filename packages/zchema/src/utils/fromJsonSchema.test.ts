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
        name: 'Example Schema',
        nullable: false,
        optional: false,
        validators: [],
        proto: expect.any(Object) as object,
        type: s.object,
        props: {
            firstName: {
                nullable: false,
                optional: false,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.string,
            },
            lastName: {
                nullable: false,
                optional: false,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.string,
            },
            age: {
                description: 'Age in years',
                nullable: false,
                optional: true,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.integer,
            },
            height: {
                nullable: false,
                optional: true,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.number,
            },
            favoriteFoods: {
                nullable: false,
                optional: true,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.array,
                of: {
                    nullable: true,
                    optional: true,
                    validators: [],
                    proto: expect.any(Object) as object,
                    type: s.unknown,
                },
            },
            likesDogs: {
                nullable: false,
                optional: true,
                validators: [],
                proto: expect.any(Object) as object,
                type: s.boolean,
            },
        },
    };

    expect(schema).toEqual(expected);
});
