/**
 * Symbol used to store changes in the tracked object.
 * @private
 */
const changesSymbol = Symbol('changes');

/**
 * Type representing an object that tracks its changes.
 * @template T - The type of the object being tracked
 */
type ChangeTracker<T> = T & {
    [changesSymbol]: Partial<T> | null;
};

/**
 * Retrieves the changes made to a tracked object.
 * Returns null if no changes have been made.
 *
 * @template T - The type of the tracked object
 * @param obj - The tracked object created by {@link trackObjectChanges}
 * @returns An object containing only the changed properties, or null if no changes were made
 */
export function getObjectChanges<T>(obj: ChangeTracker<T>) {
    return obj[changesSymbol];
}

/**
 * Creates a proxy around an object that tracks all property changes.
 * The changes can be retrieved using {@link getObjectChanges}.
 *
 * @template T - The type of the object to track
 * @param entity - The object to track changes for
 * @returns A proxy object that tracks all property changes
 *
 * @example
 * ```typescript
 * const user = trackObjectChanges({ name: 'John', age: 30 });
 * user.name = 'Jane';
 * user.age = 31;
 *
 * const changes = getObjectChanges(user);
 * // changes = { name: 'Jane', age: 31 }
 * ```
 */
export function trackObjectChanges<T extends object>(entity: T): ChangeTracker<T> {
    let changes: Partial<T> | null = null;

    const proxy = new Proxy(entity, {
        set(target, prop, value) {
            if (changes === null) {
                changes = {};
            }

            changes[prop as keyof T] = value as T[keyof T];
            target[prop as keyof T] = value as T[keyof T];
            return true;
        },
        get(target, prop) {
            if (prop === changesSymbol) {
                return changes;
            }

            return target[prop as keyof T];
        },
    });

    return proxy as ChangeTracker<T>;
}
