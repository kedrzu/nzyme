import { equals } from '@vitest/expect';
import { expect } from 'vitest';

type ExpectedPartial<T> = T extends unknown[] ? Partial<T[number]>[] : Partial<T>;

/** Asserts that the actual value partially matches the expected value using objectContaining. */
export function expectToEqualPartially<T>(actual: T, expected: ExpectedPartial<T>) {
    // `objectContaining` is typed with the strict `DeeplyAllowMatchers<T>` parameter that our
    // `Partial<T>` shape isn't assignable to; route through `unknown` typed locals so we don't
    // need an inline cast at the call site.
    const expectedAsUnknown: unknown = expected;
    const expectedResult: unknown = Array.isArray(expected)
        ? expected.map((x): unknown => {
              const itemAsUnknown: unknown = x;
              return expect.objectContaining(itemAsUnknown);
          })
        : expect.objectContaining(expectedAsUnknown);

    const pass = equals(actual, expectedResult);

    return {
        message: () => 'Expected values to be equal.',
        pass,
        actual,
        expected,
    };
}
