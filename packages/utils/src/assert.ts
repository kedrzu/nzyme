/**
 * Asserts that a value is not null or undefined.
 * Throws an error if the value is null or undefined.
 * @util
 *
 * @template T - The type of the value being asserted
 * @param value - The value to check for null/undefined
 * @param message - Optional custom error message
 * @throws {Error} When the value is null or undefined
 * @example
 * ```ts
 * const value: string | null = getValue();
 * assert(value); // Throws if value is null
 * value.toUpperCase(); // TypeScript knows value is string here
 * ```
 */
export function assert(value: unknown, message?: string): asserts value {
    if (value == null) {
        throw new Error(message ?? 'Value is not provided.');
    }
}

/**
 * Asserts that a value is equal to an expected value.
 * Throws an error if the values are not equal.
 * @util
 *
 * @template T - The type of the value being compared
 * @template E - The type of the expected value (must extend T)
 * @param value - The value to check
 * @param expected - The expected value
 * @param message - Optional custom error message
 * @throws {Error} When the values are not equal
 * @example
 * ```ts
 * const value = 5;
 * assertEquals(value, 5); // No error
 * assertEquals(value, 6); // Throws error
 * ```
 */
export function assertEquals<T, E extends T = T>(value: T, expected: E, message?: string): asserts value is T {
    if (value !== expected) {
        throw new Error(message ?? `Value is not equal to ${String(expected)}.`);
    }
}

/**
 * Asserts that a value is truthy (not false, 0, "", null, undefined, or NaN).
 * Throws an error if the value is falsy.
 * @util
 *
 * @param value - The value to check for truthiness
 * @param message - Optional custom error message
 * @throws {Error} When the value is falsy
 * @example
 * ```ts
 * const value = "hello";
 * assertTruthy(value); // No error
 * assertTruthy(""); // Throws error
 * ```
 */
export function assertTruthy(value: unknown, message?: string): asserts value {
    if (!value) {
        throw new Error(message ?? 'Value is not truthy.');
    }
}

/**
 * Asserts that a value is not null or undefined and returns it.
 * Throws an error if the value is null or undefined.
 * @util
 *
 * @template T - The type of the value being asserted
 * @param value - The value to check for null/undefined
 * @param message - Optional custom error message
 * @returns The non-null value
 * @throws {Error} When the value is null or undefined
 * @example
 * ```ts
 * const value: string | null = getValue();
 * const nonNullValue = assertValue(value); // Throws if value is null
 * nonNullValue.toUpperCase(); // TypeScript knows value is string here
 * ```
 */
export function assertValue<T>(value: T | null | undefined, message?: string): T {
    assert(value, message);
    return value;
}
