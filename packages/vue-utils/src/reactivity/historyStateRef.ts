import debounce from 'lodash.debounce';
import { onBeforeUnmount, type Ref, ref, toRaw, watch } from 'vue';

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

export /**
 *
 */
function historyStateRef<T>(
    options: HistoryStateRefDefault<T> & HistoryStateRefOptions,
): HistoryStateRef<T>;
export /**
 *
 */
function historyStateRef<T>(
    options: HistoryStateRefNoDefault & HistoryStateRefOptions,
): HistoryStateRef<null | T>;

/**
 *
 */
export function historyStateRef<T>(
    options: HistoryStateRefOptions & Partial<HistoryStateRefDefault<T>>,
): HistoryStateRef<null | T> {
    const history = useHistory();
    const key = options.key;

    const historyRef = ref<T>(read()) as Ref<T> as HistoryStateRef<T>;
    historyRef.save = save;

    watch(historyRef, options.debounce ? debounce(write, options.debounce) : write);

    history.on('popState', update);
    onBeforeUnmount(() => history.off('popState', update));

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

    function write(value: null | T) {
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
