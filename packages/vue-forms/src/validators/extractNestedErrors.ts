import type { Validation } from '../validation.js';

export function extractNestedErrors<T, K extends keyof T>(
    field: Validation<T[]>,
    index: number,
    key: K,
) {
    if (!field.$dirty) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    return field.$each?.$response?.$errors?.[index]?.[key]?.map((e: any) => e.$message);
}
