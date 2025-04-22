import { createEventEmitter } from '@nzyme/utils';

type HistoryState = Record<string, unknown>;

type HistoryEvents = {
    popState: { state: HistoryState | null };
    pushState: { state: HistoryState | null };
    replaceState: { state: HistoryState | null };
};
let history: ReturnType<typeof initializeHistory> | null = null;

/**
 *
 */
export function useHistory() {
    if (!history) {
        history = initializeHistory();
    }

    return history;
}

function initializeHistory() {
    const emitter = createEventEmitter<HistoryEvents>();

    let pushState: History['pushState'];
    let replaceState: History['replaceState'];
    let history: History | null;

    if (typeof window !== 'undefined') {
        history = window.history;

        window.addEventListener('popstate', event => {
            emitter.emit('popState', { state: normalizeState(event.state) });
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method
        pushState = history.pushState;
        history.pushState = (state, title, url) => {
            pushState.call(history, state, title, url);
            emitter.emit('pushState', { state: normalizeState(state) });
        };

        // eslint-disable-next-line @typescript-eslint/unbound-method
        replaceState = window.history.replaceState;
        history.replaceState = (state, title, url) => {
            replaceState.call(history, state, title, url);
            emitter.emit('replaceState', { state: normalizeState(state) });
        };
    }

    return {
        on: emitter.on,
        off: emitter.off,
        getState() {
            if (!history) {
                return null;
            }

            return normalizeState(history.state);
        },
        setState(state: HistoryState) {
            if (replaceState) {
                replaceState.call(history, state, '');
            }
        },
    };
}

function normalizeState(state: unknown) {
    if (!state || typeof state !== 'object') {
        return null;
    }

    return state as Record<string, unknown>;
}
