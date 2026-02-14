/**
 * Represents a value that can be null or undefined.
 *
 * @template T - The type of the value
 * @template TNullable - Whether the value can be null or undefined
 */
export type Nullable<T, TNullable extends boolean> = TNullable extends false ? T : T | null;

/**
 * Creates a nullable value.
 *
 * @template T - The type of the value
 * @template TNullable - Whether the value can be null or undefined
 * @param value - The value to make nullable
 * @returns The nullable value
 */
export function nullable<T, TNullable extends boolean>(value?: T | null): Nullable<T, TNullable> {
    return value || (null as Nullable<T, TNullable>);
}
