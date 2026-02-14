import type { PartialDeep as PartialDeepImport } from 'type-fest';

/**
 *
 */
export type PartialDeep<T> = PartialDeepImport<
    T,
    {
        /**
         *
         */
        recurseIntoArrays: true;
    }
>;
