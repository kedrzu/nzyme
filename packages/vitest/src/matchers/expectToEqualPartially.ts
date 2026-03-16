import { equals } from '@vitest/expect';
import { expect } from 'vitest';

type ExpectedPartial<T> = T extends unknown[] ? Partial<T[number]>[] : Partial<T>;

/** Asserts that the actual value partially matches the expected value using objectContaining. */
export function expectToEqualPartially<T>(actual: T, expected: ExpectedPartial<T>) {
    const expectedResult: unknown = Array.isArray(expected)
        ? expected.map(x => expect.objectContaining(x as unknown) as unknown)
        : expect.objectContaining(expected as unknown);

    const pass = equals(actual, expectedResult);

    return {
        message: () => 'Expected values to be equal.',
        pass,
        actual,
        expected,
    };
}
