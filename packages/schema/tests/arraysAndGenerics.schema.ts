// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { DataContainer } from './arraysAndGenerics.type.js';

export const DataContainerSchema: s.Schema<DataContainer, s.UnknownToInput<DataContainer>> = s.schema({
    complexArray: s.array(
        s.schema({
            id: s.number.with(s.meta, {
                description: 'Item ID',
            }),
            tags: s.array(s.string).with(s.meta, {
                description: 'Item tags',
            }),
        }),
    ),
    genericArray: s.array(s.boolean),
    items: s.array(s.string),
    matrix: s.array(s.array(s.number)),
    optionalRecord: s.optional(s.record(s.unknown)),
    recordData: s.record(s.number),
});
