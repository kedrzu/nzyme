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
