import { createEventEmitter } from '@nzyme/utils';

type HistoryState = Record<string, unknown>;

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
    const onPopState = createEventEmitter<{ state: HistoryState | null }>();
    const onPushState = createEventEmitter<{ state: HistoryState | null }>();
    const onReplaceState = createEventEmitter<{ state: HistoryState | null }>();

    let pushState: History['pushState'];
    let replaceState: History['replaceState'];
    let history: History | null;

    if (typeof window !== 'undefined') {
        history = window.history;

        window.addEventListener('popstate', event => {
            onPopState.emit({ state: normalizeState(event.state) });
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method
        pushState = history.pushState;
        history.pushState = (state, title, url) => {
            pushState.call(history, state, title, url);
            onPushState.emit({ state: normalizeState(state) });
        };

        // eslint-disable-next-line @typescript-eslint/unbound-method
        replaceState = window.history.replaceState;
        history.replaceState = (state, title, url) => {
            replaceState.call(history, state, title, url);
            onReplaceState.emit({ state: normalizeState(state) });
        };
    }

    return {
        onPopState: onPopState.event,
        onPushState: onPushState.event,
        onReplaceState: onReplaceState.event,
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
