// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNamedFunction<F extends (...args: any[]) => any>(name: string, body: F): F {
    const fn = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [name](...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return body.apply(this, args);
        },
    }[name] as F;

    return fn;
}
