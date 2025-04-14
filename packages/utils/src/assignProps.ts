/**
 * Assigns properties from one object to another and returns the result with proper typing.
 * This is a type-safe version of Object.assign that preserves the type information.
 * Unlike Object.assign, this function ensures that the returned type is a proper intersection
 * of the target and source types.
 *
 * @template T - The type of the target object
 * @template P - The type of the properties to assign (must be a record of string keys)
 * @param target - The target object to assign properties to
 * @param props - The properties to assign
 * @returns The target object with the assigned properties, properly typed as the intersection of T and P
 *
 * @example
 * ```typescript
 * const target = { a: 1 };
 * const props = { b: 2 };
 * const result = assignProps(target, props);
 * // result is typed as { a: number; b: number }
 * ```
 *
 * @example
 * ```typescript
 * // Type safety with interfaces
 * interface User {
 *     name: string;
 * }
 *
 * interface Address {
 *     street: string;
 * }
 *
 * const user: User = { name: "John" };
 * const address: Address = { street: "Main St" };
 *
 * const userWithAddress = assignProps(user, address);
 * // userWithAddress is typed as User & Address
 * ```
 *
 * @example
 * ```typescript
 * // Overlapping properties are handled correctly
 * const target = { a: 1, b: 2 };
 * const props = { b: 3, c: 4 };
 * const result = assignProps(target, props);
 * // result is typed as { a: number; b: number; c: number }
 * // target.b is overwritten with props.b
 * ```
 */
export function assignProps<T, P extends Record<string, unknown>>(target: T, props: P) {
    return Object.assign(target as object, props) as P & T;
}
