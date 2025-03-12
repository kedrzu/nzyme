/**
 * Assert that a value is provided.
 */
export function assert<T>(value: T | undefined | null, message?: string): asserts value is T {
    if (value == null) {
        throw new Error(message ?? 'Value is not provided.');
    }
}

/**
 * Assert that a value is provided and return it.
 */
export function assertValue<T>(value: T | undefined | null, message?: string): T {
    assert(value, message);
    return value;
}

/**
 * Assert that a value is equal to an expected value.
 */
export function assertEquals<T, E extends T = T>(
    value: T,
    expected: E,
    message?: string,
): asserts value is T {
    if (value !== expected) {
        throw new Error(message ?? `Value is not equal to ${String(expected)}.`);
    }
}

/**
 * Assert that a value is truthy.
 */
export function assertTruthy(value: unknown, message?: string): asserts value {
    if (!value) {
        throw new Error(message ?? 'Value is not truthy.');
    }
}
