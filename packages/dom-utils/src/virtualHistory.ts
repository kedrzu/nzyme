import { randomString } from '@nzyme/crypto';

/**
 * Handle object returned when registering a back navigation callback
 */
export interface VirtualHistoryHandle {
    /** The index position in the history stack */
    readonly index: number;
    /** Cancels the registered callback */
    cancel(this: void): void;
}

/**
 * Callback function to be executed when the user navigates back in browser history.
 */
export type VirtualHistoryCallback = () => unknown;

/**
 * State object extending the browser's history state
 */
interface VirtualHistoryState {
    virtualHistory?: VirtualHistoryData;
}

/**
 * Internal data used to track virtual history state
 */
interface VirtualHistoryData {
    sessionUid: string;
    index: number;
    virtual: boolean;
}

/**
 * The virtual history kept for one `History` object. A new one starts when `window.history` is another
 * object than the one patched — a test replacing the globals.
 */
interface VirtualHistorySession {
    readonly history: History;
    readonly uid: string;
    readonly callbacks: Map<number, VirtualHistoryCallback | null>;
}

let activeSession: VirtualHistorySession | null = null;

/**
 * Registers a callback to be executed when the user navigates back in browser history.
 * Creates a virtual history entry that doesn't actually change the URL.
 * @util
 *
 * @param callback Function to execute when the user navigates back to this point
 * @returns A handle object that can be used to cancel the callback
 */
export function onHistoryBack(callback: VirtualHistoryCallback): VirtualHistoryHandle {
    const { callbacks } = getSession();

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

function getSession() {
    if (activeSession?.history !== window.history) {
        activeSession = startSession(window.history);
    }

    return activeSession;
}

function startSession(browserHistory: History): VirtualHistorySession {
    const started: VirtualHistorySession = {
        history: browserHistory,
        uid: randomString(16),
        callbacks: new Map(),
    };

    window.addEventListener('popstate', event => onPopState(started, event));

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const pushState = browserHistory.pushState;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const replaceState = browserHistory.replaceState;

    browserHistory.pushState = function (data, title, url) {
        const index = getStateIndex(browserHistory.state as VirtualHistoryState | null) + 1;
        const state = getState(started, index, data);

        pushState.call(this, state, title, url);
    };

    browserHistory.replaceState = function (data, title, url) {
        const index = getStateIndex(browserHistory.state as VirtualHistoryState | null);
        const state = getState(started, index, data);

        replaceState.call(this, state, title, url);
    };

    browserHistory.replaceState(browserHistory.state, document.title, null);

    return started;
}

function getState(session: VirtualHistorySession, index: number, data?: unknown) {
    let state: VirtualHistoryState = {
        virtualHistory: {
            sessionUid: session.uid,
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

function onPopState(session: VirtualHistorySession, event: PopStateEvent) {
    const state = event.state as VirtualHistoryState | null;
    const index = getStateIndex(state);

    // user may have gone back to some other session
    // we shouldn't do anything about that
    if (state?.virtualHistory?.sessionUid !== session.uid) {
        return;
    }

    const { callbacks } = session;
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
        void entry.callback?.();

        if (entry.callback == null && entry.key === index + 1) {
            history.back();
        }
    }
}

function getStateIndex(state: VirtualHistoryState | null) {
    return state?.virtualHistory?.index || 0;
}
