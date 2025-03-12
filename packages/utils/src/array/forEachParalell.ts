type ForEachParalellParams<T> = {
    callback: (item: T, index: number) => Promise<unknown> | void;
    concurrency: number;
};

/**
 * Runs a callback for each item in an array in parallel.
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

            // eslint-disable-next-line no-constant-condition
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
