import { randomGuid } from '@nzyme/crypto-utils';

interface VirtualHistoryState {
    virtualHistory?: VirtualHistoryData;
}

interface VirtualHistoryData {
    sessionUid: string;
    index: number;
    virtual: boolean;
}

export interface VirtualHistoryHandle {
    readonly index: number;
    cancel(this: void): void;
}

type Callback = () => void;

let initialized = false;
const callbacks = new Map<number, Callback | null>();
const uid = randomGuid();

export function onHistoryBack(callback: Callback): VirtualHistoryHandle {
    initialize();

    history.pushState(history.state, document.title, null);
    const index = getStateIndex(history.state as VirtualHistoryState | null);

    callbacks.set(index, callback);

    return {
        index,
        cancel() {
            callbacks.set(index, null);
        },
    };
}

function initialize() {
    if (initialized) {
        return;
    }

    window.addEventListener('popstate', onPopState);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const pushState = window.history.pushState;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const replaceState = window.history.replaceState;

    window.history.pushState = function (data, title, url) {
        const index = getStateIndex(history.state as VirtualHistoryState | null) + 1;
        const state = getState(index, data);

        pushState.call(this, state, title, url);
    };

    window.history.replaceState = function (data, title, url) {
        const index = getStateIndex(history.state as VirtualHistoryState | null);
        const state = getState(index, data);

        replaceState.call(this, state, title, url);
    };

    window.history.replaceState(history.state, document.title, null);

    initialized = true;
}

function getState(index: number, data?: unknown) {
    let state: VirtualHistoryState = {
        virtualHistory: {
            sessionUid: uid,
            index: index,
            virtual: false,
        },
    };

    // if there is already a state object, merge it
    if (data && typeof data === 'object') {
        state = Object.assign(data, state);
    }

    return state;
}

function onPopState(event: PopStateEvent) {
    const state = event.state as VirtualHistoryState | null;
    const index = getStateIndex(state);

    // user may have gone back to some other session
    // we shouldn't do anything about that
    if (state?.virtualHistory?.sessionUid !== uid) {
        return;
    }

    const keys = [...callbacks.keys()].filter(x => x > index);
    // sort in reverse order
    keys.sort((k1, k2) => k2 - k1);

    const entries = keys.map(key => {
        const callback = callbacks.get(key);
        callbacks.delete(key);

        return {
            key,
            callback,
        };
    });

    for (const entry of entries) {
        entry.callback?.();

        if (entry.callback == null && entry.key === index + 1) {
            history.back();
        }
    }
}

function getStateIndex(state: VirtualHistoryState | null) {
    const index = state?.virtualHistory?.index || 0;
    return Number(index);
}
