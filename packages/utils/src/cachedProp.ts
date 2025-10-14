/**
 * Decorator that caches the result of a getter property.
 * The getter is called only once per instance, and subsequent accesses return the cached value.
 *
 * @param _target - The class prototype
 * @param _methodName - The name of the property
 * @param descriptor - The property descriptor
 *
 * @example
 * ```typescript
 * class Foo {
 *     @cachedProp
 *     public get expensiveValue() {
 *         // This will be called only once per instance
 *         return computeExpensiveValue();
 *     }
 * }
 * ```
 */
export function cachedProp(_target: object, _methodName: string, descriptor: PropertyDescriptor) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const get = descriptor.get;
    if (!get) {
        return;
    }

    const symbol = Symbol();

    descriptor.get = function (this: object) {
        const cache = (this as Record<symbol, unknown>)[symbol];
        if (cache) {
            return cache;
        }

        const value = get.apply(this) as unknown;
        (this as Record<symbol, unknown>)[symbol] = value;
        return value;
    };
}
