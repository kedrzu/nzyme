/**
 * Waits until the condition is true.
 * @param condition - The condition to wait for.
 * @param intervalMs - The interval in milliseconds to check the condition.
 * @returns A promise that resolves when the condition is true.
 */
export function waitUntil(condition: () => unknown, intervalMs: number = 100) {
    return new Promise<void>(resolve => {
        const interval = setInterval(() => {
            if (condition()) {
                clearInterval(interval);
                resolve();
            }
        }, intervalMs);
    });
}
