/**
 * Omits the specified properties from the target object.
 *
 * @param target - The object to omit properties from.
 * @param props - The properties to omit.
 * @returns A new object with the specified properties omitted.
 * @__NO_SIDE_EFFECTS__
 */
export function omitProps<T extends object, K extends keyof T>(target: T, props: K[]): Omit<T, K> {
    const result = { ...target };

    for (const prop of props) {
        delete result[prop];
    }
    return result;
}
