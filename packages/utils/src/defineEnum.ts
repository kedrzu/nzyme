/**
 * Type representing an enum with both array and object-like access.
 * @template T - The type of the enum values array
 */
export type Enum<T extends string[]> = T & {
    [K in T[number] as K & string]: K;
};

/**
 * Creates a type-safe enum from an array of string values.
 * The resulting enum can be accessed both as an array and as an object.
 *
 * @template T - The type of the enum values array
 * @param values - Array of string values to create the enum from
 * @returns An enum that can be accessed both as an array and as an object
 *
 * @example
 * ```typescript
 * const Status = defineEnum(['active', 'inactive', 'pending'] as const);
 *
 * // Array access
 * console.log(Status[0]); // 'active'
 *
 * // Object access
 * console.log(Status.active); // 'active'
 *
 * // Type safety
 * const status: typeof Status[number] = 'active'; // OK
 * const invalid: typeof Status[number] = 'invalid'; // Error
 * ```
 * @__NO_SIDE_EFFECTS__
 */
export function defineEnum<const T extends string[]>(values: T): Enum<T> {
    for (const value of values) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        values[value as any] = value;
    }

    return values as Enum<T>;
}
