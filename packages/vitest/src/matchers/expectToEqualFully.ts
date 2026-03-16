import { equals } from '@vitest/expect';

/** Asserts that the actual value deeply equals the expected value with strict equality. */
export function expectToEqualFully<T>(actual: T, expected: T) {
    const pass = equals(actual, expected);

    return {
        message: () => 'Expected values to be equal.',
        pass,
        actual,
        expected,
    };
}
