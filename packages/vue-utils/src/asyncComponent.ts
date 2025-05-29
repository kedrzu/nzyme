/**
 * Async component import.
 *
 * @param promise - The promise to import the component from.
 * @returns The component.
 */
export function asyncComponent<T>(fcn: () => Promise<{ default: T }>) {
    return () => fcn().then(m => m.default);
}
