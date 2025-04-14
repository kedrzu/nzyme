/**
 * Creates a new iterable that yields all elements from the first iterable followed by all elements from the second iterable.
 *
 * @template T - The type of elements in the iterables
 * @param a - The first iterable
 * @param b - The second iterable
 * @yields All elements from both iterables in sequence
 */
export function* concatIterable<T>(a: Iterable<T>, b: Iterable<T>): Iterable<T> {
    yield* a;
    yield* b;
}
