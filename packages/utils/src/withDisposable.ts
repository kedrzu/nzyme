/**
 * Wraps an object with a disposable interface.
 * If the object already has a dispose method, it will be called before the new dispose method.
 * @param obj - The object to wrap
 * @param dispose - The dispose method to call when the object is disposed
 * @returns The wrapped object
 */
export function withDisposable<T extends object>(obj: T, dispose: () => void): Disposable & T {
    const currentDispose = (obj as Partial<Disposable>)[Symbol.dispose];
    if (currentDispose) {
        (obj as Disposable)[Symbol.dispose] = () => {
            currentDispose();
            dispose();
        };
    } else {
        (obj as Disposable)[Symbol.dispose] = dispose;
    }

    return obj as Disposable & T;
}
