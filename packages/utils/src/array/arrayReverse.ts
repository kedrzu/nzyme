/**
 * Creates an iterable that yields elements of an array in reverse order.
 *
 * @template T - The type of elements in the array
 * @param array - The array to iterate over in reverse
 * @returns An iterable that yields elements from the array in reverse order
 */
// #__NO_SIDE_EFFECTS__
export function arrayReverse<T>(array: readonly T[]): Iterable<T> {
    let index = array.length;

    const iterator: Iterator<T> = {
        next() {
            index--;

            if (index < 0) {
                return {
                    done: true,
                    value: undefined,
                };
            }

            return {
                done: false,
                value: array[index]!,
            };
        },
    };

    return {
        [Symbol.iterator]: () => iterator,
    };
}
