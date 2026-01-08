// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { DataContainer as DataContainerType } from './arraysAndGenerics.type.js';

export const DataContainer: s.Schema<DataContainerType, s.UnknownToInput<DataContainerType>> = s.schema({
    items: s.array(s.string),
    matrix: s.array(s.array(s.number)),
    genericArray: s.array(s.boolean),
    complexArray: s.array(
        s.schema({
            id: s.number,
            tags: s.array(s.string),
        }),
    ),
    recordData: s.record(s.number),
    optionalRecord: s.optional(s.record(s.unknown)),
});

export type DataContainer = DataContainerType;
