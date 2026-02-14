import { equals } from '@vitest/expect';

/**
 *
 */
export function expectToEqualFully<T>(actual: T, expected: T) {
    const pass = equals(actual, expected);

    return {
        message: () => 'Expected values to be equal.',
        pass,
        actual,
        expected,
    };
}
