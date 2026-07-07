/**
 * Sets a JSON-serializable value in localStorage.
 * @util
 * @param key The localStorage key to store the value under
 * @param value The value to store (will be JSON-serialized)
 */
export function localStorageSetJson<T>(key: string, value: T) {
    if (typeof localStorage === 'undefined') {
        return;
    }

    const json = JSON.stringify(value);
    localStorage.setItem(key, json);
}

/**
 * Retrieves and parses a JSON value from localStorage.
 * @util
 * @param key The localStorage key to retrieve
 * @returns The parsed value, or null if the key doesn't exist or localStorage is unavailable
 */
export function localStorageGetJson<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    const json = localStorage.getItem(key);
    if (!json) {
        return null;
    }

    return JSON.parse(json) as T;
}
