import debounce from 'lodash.debounce';
import { ref, toRaw, watch } from 'vue';
import type { Ref } from 'vue';

import { onEventEmitter } from '../onEventEmitter.js';
import { useHistory } from '../useHistory.js';

/**
 *
 */
export interface HistoryStateRef<T> extends Ref<T> {
    /**
     *
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
 *
 */
export function historyStateRef<T>(options: HistoryStateRefDefault<T> & HistoryStateRefOptions): HistoryStateRef<T>;
/**
 *
 */
export function historyStateRef<T>(
    options: HistoryStateRefNoDefault & HistoryStateRefOptions,
): HistoryStateRef<T | null>;

/**
 *
 */
export function historyStateRef<T>(
    options: HistoryStateRefOptions & Partial<HistoryStateRefDefault<T>>,
): HistoryStateRef<T | null> {
    const history = useHistory();
    const key = options.key;

    const historyRef = ref<T>(read()) as Ref<T> as HistoryStateRef<T>;
    historyRef.save = save;

    watch(historyRef, options.debounce ? debounce(write, options.debounce) : write);
    onEventEmitter(history.onPopState, update);

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
