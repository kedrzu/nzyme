import debounce from 'lodash.debounce';
import { ref, toRaw, watch } from 'vue';
import type { Ref } from 'vue';

import { onEventEmitter } from '../onEventEmitter.js';
import { useHistory } from '../useHistory.js';

/**
 * A reactive reference that synchronizes its value with browser history state.
 * Automatically persists data across browser navigation and provides manual save functionality.
 *
 * @template T The type of value stored in the ref and history state
 */
export interface HistoryStateRef<T> extends Ref<T> {
    /**
     * Explicitly saves the current value to history state.
     * This is usually not needed as values are automatically saved when changed.
     */
    save(): void;
}

type HistoryStateRefDefault<T> = {
    default: () => T;
};

type HistoryStateRefNoDefault = {
    default?: never;
};

type HistoryStateRefOptions = {
    debounce?: number;
    deep?: boolean;
    key: string;
};

/**
 * Creates a ref that synchronizes with browser history state with a default value.
 *
 * @template T The type of value to store
 * @param options Configuration options including a default value function
 * @returns A HistoryStateRef that never returns null
 */
export function historyStateRef<T>(options: HistoryStateRefDefault<T> & HistoryStateRefOptions): HistoryStateRef<T>;
/**
 * Creates a ref that synchronizes with browser history state without a default value.
 *
 * @template T The type of value to store
 * @param options Configuration options without a default value
 * @returns A HistoryStateRef that may return null when no value is stored
 */
export function historyStateRef<T>(
    options: HistoryStateRefNoDefault & HistoryStateRefOptions,
): HistoryStateRef<T | null>;

/**
 * Creates a reactive reference that automatically synchronizes its value with browser history state.
 * The value persists across browser navigation (back/forward) and page reloads within the same session.
 *
 * Unlike localStorage or sessionStorage, history state is tied to the specific browser history entry,
 * so different navigation paths can have different values for the same key.
 *
 * @template T The type of value to store
 * @param options Configuration options for the history state ref
 * @returns A HistoryStateRef instance
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { historyStateRef } from '@nzyme/vue-utils';
 *
 * // With default value
 * const currentTab = historyStateRef({
 *   key: 'active-tab',
 *   default: () => 'overview'
 * });
 *
 * // Without default (can be null)
 * const searchQuery = historyStateRef({
 *   key: 'search-query'
 * });
 *
 * // With debouncing for rapid changes
 * const formData = historyStateRef({
 *   key: 'form-data',
 *   debounce: 300,
 *   deep: true,
 *   default: () => ({ name: '', email: '' })
 * });
 *
 * // Values persist when navigating back/forward
 * currentTab.value = 'settings'; // Saved to history state
 * // If user navigates away and back, currentTab.value will still be 'settings'
 * </script>
 * ```
 */
export function historyStateRef<T>(
    options: HistoryStateRefOptions & Partial<HistoryStateRefDefault<T>>,
): HistoryStateRef<T | null> {
    const history = useHistory();
    const key = options.key;

    const historyRef = ref<T>(read()) as Ref<T> as HistoryStateRef<T>;
    historyRef.save = save;

    watch(historyRef, options.debounce ? debounce(write, options.debounce) : write);
    onEventEmitter(history.events.popState, update);

    return historyRef;

    function update() {
        historyRef.value = read();
    }

    function read() {
        const state = history.getState();

        if (!state) {
            return getDefault();
        }

        return (state[key] as T | undefined) ?? getDefault();
    }

    function write(value: T | null) {
        if (!history) {
            return;
        }

        const state = history.getState() ?? {};
        state[key] = toRaw(value);
        history.setState(state);
    }

    function getDefault() {
        if (options.default) {
            return options.default();
        }

        return null as T;
    }

    function save() {
        write(historyRef.value);
    }
}
