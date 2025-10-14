interface IsArray {
    (o: unknown): o is readonly unknown[];
}

/**
 * Checks if the given value is an array.
 * Alias for {@link Array.isArray}, but with better type inference.
 */
export const isArray = Array.isArray as IsArray;
