// This file is auto-generated. Do not edit manually.

import * as z from 'zod/mini';

import type { DataContainer as DataContainerType } from './arraysAndGenerics.type.js';

export const DataContainer: z.ZodMiniType<DataContainerType> = z.object({
    items: z.array(z.string()),
    matrix: z.array(z.array(z.number())),
    genericArray: z.array(z.boolean()),
    complexArray: z.array(
        z.object({
            id: z.number(),
            tags: z.array(z.string()),
        }),
    ),
    recordData: z.record(z.string(), z.number()),
    optionalRecord: z.optional(z.record(z.string(), z.unknown())),
});

export type DataContainer = DataContainerType;
