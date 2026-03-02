import debounce from 'lodash.debounce';
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

import { identity } from '@nzyme/utils/functions/identity.js';

/**
 * A reactive reference that synchronizes its value with browser storage (localStorage or sessionStorage).
 * Provides methods to control synchronization, reload data, and clear values.
 *
 * @template T The type of value stored in the ref and browser storage
 */
export interface StorageRef<T> extends Ref<T> {
    /**
     * Reloads the value from storage, overwriting the current value in the ref.
     * This is useful when you want to discard local changes and restore the stored value.
     */
    reload(): void;

    /**
     * Starts listening for storage events to sync changes across browser tabs.
     * When the value changes in another tab, this ref will be updated automatically.
     */
    startSync(): void;

    /**
     * Stops listening for storage events.
     * Changes in other tabs will no longer affect this ref.
     */
    stopSync(): void;

    /**
     * Explicitly saves the current value to storage.
     * This is usually not needed as values are automatically saved when changed.
     */
    save(): void;

    /**
     * Clears the value, setting it back to the default value (or null if no default).
     * Also removes the value from storage.
     */
    clear(): void;
}

/**
 * Configuration options for creating a storage ref.
 */
export type StorageRefOptions = {
    /**
     * Debounce time in milliseconds for saving changes to storage.
     * Useful to prevent too frequent storage updates when the value changes rapidly.
     */
    debounce?: number;

    /**
     * Whether to deeply watch object values for changes.
     * When true, nested object changes will trigger storage updates.
     */
    deep?: boolean;

    /**
     * The key under which to store the value in storage.
     * This must be unique within your application.
     */
    key: string;

    /**
     * Which storage to use:
     * - 'local': localStorage (persists across browser restarts)
     * - 'session': sessionStorage (cleared when browser is closed)
     */
    storage?: 'local' | 'session';

    /**
     * When to sync changes across browser tabs:
     * - 'always': Start syncing immediately
     * - 'when-mounted': Only sync while component is mounted
     */
    sync?: 'always' | 'when-mounted';
};

/**
 * Options for storing values with custom serialization/deserialization.
 */
export type StorageRefOptionsCustom<T> = StorageRefOptions & {
    /**
     * Function to convert stored string back to value of type T.
     */
    deserialize: (value: string) => T;
    json?: false;
    /**
     * Function to convert value of type T to string for storage.
     */
    serialize: (value: T) => string;
};

/**
 * Options for providing a default value.
 */
type StorageRefDefault<T> = {
    /**
     * Function that returns the default value when storage is empty.
     */
    default: () => T;
};

/**
 * Options for refs without a default value (will use null).
 */
type StorageRefNoDefault = {
    /**
     * No default value provided - will use null.
     */
    default?: undefined;
};

/**
 * Options for storing raw string values without serialization.
 */
type StorageRefOptionsRaw = StorageRefOptions & {
    deserialize?: undefined;
    json?: false;
    serialize?: undefined;
};

/**
 * Options for storing JSON-serializable values.
 */
type StorageRefOptionsJson = StorageRefOptions & {
    deserialize?: undefined;
    /**
     * When true, uses JSON.stringify/parse for serialization.
     */
    json: true;
    serialize?: undefined;
};

const skipWrite = Symbol();
type StorageValue<T> = T & { [skipWrite]?: true };

/**
 * Creates a ref that synchronizes with browser storage for string values.
 * @param options Configuration with default value and raw storage
 */
export function storageRef(options: StorageRefDefault<string> & StorageRefOptionsRaw): StorageRef<string>;
/**
 * Creates a ref that synchronizes with browser storage for string values.
 * @param options Configuration without default value and raw storage
 */
export function storageRef(options: StorageRefNoDefault & StorageRefOptionsRaw): StorageRef<string | null>;
/**
 * Creates a ref that synchronizes with browser storage using JSON serialization.
 * @param options Configuration with default value and JSON serialization
 */
export function storageRef<T>(options: StorageRefDefault<T> & StorageRefOptionsJson): StorageRef<T>;
/**
 * Creates a ref that synchronizes with browser storage using JSON serialization.
 * @param options Configuration without default value and JSON serialization
 */
export function storageRef<T>(options: StorageRefNoDefault & StorageRefOptionsJson): StorageRef<T | null>;
/**
 * Creates a ref that synchronizes with browser storage using custom serialization.
 * @param options Configuration with custom serialization
 */
export function storageRef<T>(options: StorageRefOptionsCustom<T>): StorageRef<T | null>;
/**
 * Creates a ref that synchronizes with browser storage using custom serialization.
 * @param options Configuration with default value and custom serialization
 */
export function storageRef<T>(options: StorageRefDefault<T> & StorageRefOptionsCustom<T>): StorageRef<T>;
/**
 * Creates a reactive reference that automatically synchronizes its value with browser storage.
 *
 * Features:
 * - Automatic synchronization with localStorage or sessionStorage
 * - Optional cross-tab synchronization
 * - Configurable serialization (raw, JSON, or custom)
 * - Default values
 * - Deep watching for nested objects
 * - Debounced storage updates
 *
 * @template T The type of value to store
 * @param options Configuration options for the storage ref
 * @returns A StorageRef instance
 *
 * @example
 * ```ts
 * // Simple string storage
 * const name = storageRef({
 *   key: 'user-name',
 *   storage: 'local',
 *   default: () => ''
 * });
 *
 * // JSON storage with cross-tab sync
 * const settings = storageRef({
 *   key: 'app-settings',
 *   storage: 'local',
 *   json: true,
 *   sync: 'always',
 *   default: () => ({ theme: 'light', fontSize: 14 })
 * });
 *
 * // Custom serialization
 * const date = storageRef({
 *   key: 'selected-date',
 *   storage: 'local',
 *   serialize: (date: Date) => date.toISOString(),
 *   deserialize: (str: string) => new Date(str)
 * });
 * ```
 */
export function storageRef<T>(
    options: Partial<StorageRefDefault<T>> &
        (StorageRefOptionsCustom<T> | StorageRefOptionsJson | StorageRefOptionsRaw),
): StorageRef<T | null> {
    const key = options.key;
    const serialize = options.serialize ?? (options.json ? JSON.stringify : (identity as (value: T) => string));
    const deserialize = options.deserialize ?? ((options.json ? JSON.parse : identity) as (value: string) => T);
    const storage = getStorage(options.storage);

    const variable = (options.deep ? ref<T | null>(read()) : shallowRef<T | null>(read())) as StorageRef<T | null>;

    const watcher = options.debounce ? debounce(write, options.debounce) : write;
    watch(variable, watcher, { deep: options.deep });

    variable.reload = reload;
    variable.startSync = startSync;
    variable.stopSync = stopSync;
    variable.save = save;
    variable.clear = clear;

    if (options.sync && storage) {
        if (options.sync === 'always') {
            startSync();
        } else if (options.sync === 'when-mounted') {
            onMounted(startSync);
            onUnmounted(stopSync);
        }
    }

    return variable;

    function reload(): T {
        const value = read();
        updateNoWrite(value);
        return value;
    }

    function read() {
        if (!storage) {
            return getDefault();
        }

        const item = storage.getItem(key);
        if (!item) {
            return getDefault();
        }

        return deserialize(item);
    }

    function updateNoWrite(value: T) {
        if (value != null && typeof value === 'object') {
            // Prevent writing back to localStorage
            (value as StorageValue<T>)[skipWrite] = true;
        }

        variable.value = value;
    }

    function write(value: T | null) {
        if (!storage) {
            return;
        }

        if (value == null) {
            storage.removeItem(key);
        } else if ((value as StorageValue<T>)[skipWrite]) {
            delete (value as StorageValue<T>)[skipWrite];
        } else {
            storage.setItem(key, serialize(value));
        }
    }

    function startSync() {
        window.addEventListener('storage', sync);
    }

    function stopSync() {
        window.removeEventListener('storage', sync);
    }

    function sync(event: StorageEvent) {
        if (event.storageArea === storage && event.key === key) {
            const value = event.newValue ? deserialize(event.newValue) : getDefault();
            updateNoWrite(value);
        }
    }

    function getDefault() {
        if (options.default) {
            return options.default();
        }

        return null as T;
    }

    function save() {
        write(variable.value);
    }

    function clear() {
        variable.value = getDefault();
    }
}

function getStorage(storage: 'local' | 'session' | undefined) {
    if (storage === 'session' && typeof sessionStorage !== 'undefined') {
        return sessionStorage;
    } else if (typeof localStorage !== 'undefined') {
        return localStorage;
    }

    return null;
}
