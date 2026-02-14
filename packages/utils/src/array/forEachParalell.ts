/**
 * Parameters for the forEachParalell function
 *
 * @template T - The type of elements in the array
 */
type ForEachParalellParams<T> = {
    /** Function to call for each element */
    callback: (item: T, index: number) => Promise<unknown> | void;
    /** Maximum number of concurrent operations */
    concurrency: number;
};

/**
 * Executes a callback function for each element in an array in parallel, with a specified level of concurrency.
 * The callback can return a Promise or void, and returning false from the callback will stop the iteration.
 *
 * @template T - The type of elements in the array
 * @param array - The array to iterate over
 * @param params - Configuration for the parallel execution
 * @returns A Promise that resolves when all callbacks have completed
 * @throws If any callback throws an error, the Promise is rejected with that error
 */
export function forEachParalell<T>(array: readonly T[], params: ForEachParalellParams<T>) {
    return new Promise<void>((resolve, reject) => {
        const { callback, concurrency } = params;
        let index = 0;
        let active = 0;
        let done = false;

        for (let i = 0; i < concurrency; i++) {
            void start();
        }

        async function start() {
            active++;

            while (true) {
                if (done) {
                    return;
                }

                if (index >= array.length) {
                    active--;

                    if (active === 0) {
                        done = true;
                        resolve();
                    }
                    return;
                }

                const item = array[index++]!;
                try {
                    const result = await callback(item, index - 1);
                    if (result === false) {
                        // When the callback returns false, we stop the loop.
                        index = array.length;
                    }
                } catch (e) {
                    done = true;
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                    reject(e);
                }
            }
        }
    });
}
