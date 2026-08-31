import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

type HistoryState = Record<string, unknown>;

let history: ReturnType<typeof initializeHistory> | null = null;

/**
 * Composable that provides enhanced browser history management with event listeners.
 * Returns a singleton history manager with events for state changes and state management utilities.
 *
 * @returns History manager with event listeners and state management methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useHistory } from '@nzyme/vue-utils/useHistory.js';
 *
 * const history = useHistory();
 *
 * // Listen to history changes
 * history.onPopState(({ state }) => {
 *   console.log('Back/forward navigation:', state);
 * });
 *
 * history.onPushState(({ state }) => {
 *   console.log('New page pushed:', state);
 * });
 *
 * // Get current state
 * const currentState = history.getState();
 *
 * // Set state without navigation
 * history.setState({ userId: 123, tab: 'profile' });
 * </script>
 * ```
 */
export function useHistory() {
    if (!history) {
        history = initializeHistory();
    }

    return history;
}

function initializeHistory() {
    const eventPopState = createEventEmitter<{ state: HistoryState | null }>();
    const eventPushState = createEventEmitter<{ state: HistoryState | null }>();
    const eventReplaceState = createEventEmitter<{ state: HistoryState | null }>();

    let pushState: History['pushState'];
    let replaceState: History['replaceState'];
    let browserHistory: History | null;

    if (typeof window !== 'undefined') {
        browserHistory = window.history;

        window.addEventListener('popstate', event => {
            eventPopState.emit({ state: normalizeState(event.state) });
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method
        pushState = browserHistory.pushState;
        browserHistory.pushState = (state, title, url) => {
            pushState.call(browserHistory, state, title, url);
            eventPushState.emit({ state: normalizeState(state) });
        };

        // eslint-disable-next-line @typescript-eslint/unbound-method
        replaceState = window.history.replaceState;
        browserHistory.replaceState = (state, title, url) => {
            replaceState.call(browserHistory, state, title, url);
            eventReplaceState.emit({ state: normalizeState(state) });
        };
    }

    return {
        events: {
            popState: eventPopState.event,
            pushState: eventPushState.event,
            replaceState: eventReplaceState.event,
        },
        getState() {
            if (!browserHistory) {
                return null;
            }

            return normalizeState(browserHistory.state);
        },
        setState(state: HistoryState) {
            if (replaceState) {
                replaceState.call(browserHistory, state, '');
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
