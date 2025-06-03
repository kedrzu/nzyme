/**
 * Creates a wrapper that ensures a function is executed only once at a time
 * @param fn The async function to wrap
 * @returns A wrapped function that will only execute once at a time
 */
export function withSingleExecution<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
    let promise: Promise<TReturn> | null = null;

    return async (...args: TArgs) => {
        if (promise) {
            return await promise;
        }

        promise = (async () => {
            try {
                return await fn(...args);
            } finally {
                promise = null;
            }
        })();

        return await promise;
    };
}
