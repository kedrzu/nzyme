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
 * What Back to before an entry runs. Cancelled, its callback is `null` and Back steps over the entry.
 */
interface VirtualHistoryEntry {
    callback: VirtualHistoryCallback | null;
}

/**
 * A step back over a cancelled entry, from when it is asked until it lands.
 */
interface VirtualHistoryStep {
    /** Index of the entry it was asked from. */
    readonly from: number;
    /** Index of the last entry pushed since it was asked: the step lands under it, undoing it. */
    pushed: number | null;
    readonly timeout: ReturnType<typeof setTimeout>;
}

/**
 * The virtual history kept for one `History` object. A new one starts when `window.history` is another
 * object than the one patched — a test replacing the globals.
 */
interface VirtualHistorySession {
    readonly history: History;
    readonly uid: string;
    readonly entries: Map<number, VirtualHistoryEntry>;
    step: VirtualHistoryStep | null;
    /** Set while going forward to an entry a step undid, until it lands. */
    returning: ReturnType<typeof setTimeout> | null;
}

/**
 * How long a step nzyme takes through the history may take to land before it is given up on: one that
 * leaves the document never lands.
 */
const STEP_TIMEOUT_MS = 1000;

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
    const { entries } = getSession();

    history.pushState(history.state, document.title, null);
    const index = getStateIndex(history.state as VirtualHistoryState | null);

    const entry: VirtualHistoryEntry = { callback };
    entries.set(index, entry);

    return {
        index,
        cancel() {
            // Once Back has run the callback, the entry is no longer kept: there is nothing left to step over.
            entry.callback = null;
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
        entries: new Map(),
        step: null,
        returning: null,
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

        if (started.step) {
            started.step.pushed = index;
        }
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
    if (session.returning) {
        // Back at the entry the app pushed, after the detour hidden from the listeners added later.
        clearTimeout(session.returning);
        session.returning = null;
        event.stopImmediatePropagation();
        return;
    }

    const state = event.state as VirtualHistoryState | null;
    const index = getStateIndex(state);
    const isOwnState = state?.virtualHistory?.sessionUid === session.uid;

    const step = session.step;
    if (step) {
        clearTimeout(step.timeout);
        session.step = null;

        if (step.pushed != null) {
            // The app navigated before the step landed, and the step has undone it: go forward to where the app
            // went. Listeners added after this one never see the detour; one added before (a router created
            // before the first entry) sees both steps and follows them back to where the app went.
            event.stopImmediatePropagation();
            // A step goes from the entry that was current when it was asked.
            const delta = step.pushed - (isOwnState ? index : step.from - 1);
            if (delta !== 0) {
                session.returning = setTimeout(() => (session.returning = null), STEP_TIMEOUT_MS);
                session.history.go(delta);
            }

            return;
        }
    }

    // user may have gone back to some other session
    // we shouldn't do anything about that
    if (!isOwnState) {
        return;
    }

    const { entries } = session;
    const keys = [...entries.keys()].filter(x => x > index);
    // sort in reverse order
    keys.sort((k1, k2) => k2 - k1);

    // The callbacks are read before any runs: one cancelling an entry Back has already gone past (a modal
    // closing the others) must not make it an entry to step over.
    const popped = keys.map(key => {
        const callback = entries.get(key)?.callback;
        entries.delete(key);

        return {
            key,
            callback,
        };
    });

    for (const entry of popped) {
        void entry.callback?.();

        if (entry.callback == null && entry.key === index + 1) {
            session.step = {
                from: index,
                pushed: null,
                timeout: setTimeout(() => (session.step = null), STEP_TIMEOUT_MS),
            };
            session.history.back();
        }
    }
}

function getStateIndex(state: VirtualHistoryState | null) {
    return state?.virtualHistory?.index || 0;
}
