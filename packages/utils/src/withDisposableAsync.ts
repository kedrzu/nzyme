/**
 * Wraps an object with an asynchronous dispose method.
 * If the object already has a dispose method, it will be called before the new dispose method.
 * @param obj - The object to wrap
 * @param dispose - The dispose method to call when the object is disposed
 * @returns The wrapped object
 */
export function withDisposableAsync<T extends object>(obj: T, dispose: () => Promise<void>): AsyncDisposable & T {
    const currentDispose = (obj as Partial<AsyncDisposable>)[Symbol.asyncDispose];
    if (currentDispose) {
        (obj as AsyncDisposable)[Symbol.asyncDispose] = async () => {
            await currentDispose();
            await dispose();
        };
    } else {
        (obj as AsyncDisposable)[Symbol.asyncDispose] = dispose;
    }

    return obj as AsyncDisposable & T;
}
