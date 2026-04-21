import type { PartialDeep as PartialDeepImport } from 'type-fest';

/** Recursively makes all properties of T optional, including nested objects and array elements. */
export type PartialDeep<T> = PartialDeepImport<
    T,
    {
        /** Also make array/tuple elements partial recursively. */
        recurseIntoArrays: true;
    }
>;
