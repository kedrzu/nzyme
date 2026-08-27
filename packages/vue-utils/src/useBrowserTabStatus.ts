import { onScopeDispose, ref } from 'vue';

import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

/**
 * The status of the browser tab.
 */
export type BrowserTabStatus =
    /** The tab is in the background. */
    | 'background'
    /** The tab is in the foreground, but offline. */
    | 'offline'
    /** The tab is in the foreground and online. */
    | 'online'
    /** The tab is resuming from a background state. */
    | 'resuming';

/**
 * Options for the useBrowserTabStatus hook.
 */
export interface BrowserTabStatusOptions {
    /** URL to ping to confirm real connectivity (should return 200/204 fast). */
    pingUrl?: string;
    /** Timeout for a single ping (ms). Default: 2500 */
    pingTimeoutMs?: number;
    /** Interval to recheck connectivity in foreground (ms). Default: 15000 */
    steadyPingIntervalMs?: number;
}

/**
 * Returns the current status of the tab.
 */
export function useBrowserTabStatus(options: BrowserTabStatusOptions = {}) {
    const state = ref<BrowserTabStatus>('online');

    let steadyTimer: number | undefined;
    let abortPing: AbortController | null = null;

    const { pingUrl, pingTimeoutMs = 2500, steadyPingIntervalMs = 15000 } = options;

    if (isBrowser()) {
        void classifyInitial();

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
    }

    onScopeDispose(() => {
        clearSteadyPing();
        abortPing?.abort();

        if (isBrowser()) {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        }
    });

    return state;

    async function classifyInitial() {
        if (document.hidden) {
            state.value = 'background';
            return;
        }
        const ok = await healthCheck();
        if (ok) {
            state.value = 'online';
            startSteadyPing();
        } else {
            state.value = 'offline';
        }
    }

    async function healthCheck(): Promise<boolean> {
        if (!pingUrl) {
            return  navigator.onLine; // fallback only
        }

        abortPing?.abort();
        abortPing = new AbortController();

        try {
            const res = await withTimeout({
                operation: signal =>
                    fetch(pingUrl, {
                        method: 'GET',
                        cache: 'no-store',
                        signal,
                        credentials: 'omit',
                    }),
                timeoutMs: pingTimeoutMs,
                signal: abortPing.signal,
            });

            return res.ok;
        } catch {
            return false;
        }
    }

    function onVisibilityChange() {
        if (document.hidden) {
            state.value = 'background';
            clearSteadyPing();
        } else {
            void onResume();
        }
    }

    function onOnline() {
        if (!document.hidden) {
            void onResume();
        }
    }

    function onOffline() {
        state.value = 'offline';
        clearSteadyPing();
    }

    async function onResume() {
        state.value = 'resuming';
        const ok = await healthCheck();
        if (ok) {
            state.value = 'online';
            startSteadyPing();
        } else {
            state.value = 'offline';
        }
    }

    function startSteadyPing() {
        clearSteadyPing();
        if (!pingUrl) {
            return;
        }
        steadyTimer = window.setInterval(() => void executeSteadyPing(), steadyPingIntervalMs);
    }

    async function executeSteadyPing() {
        if (document.hidden) {
            return;
        }

        const ok = await healthCheck();
        if (!ok) {
            state.value = 'offline';
            clearSteadyPing();
        }
    }

    function clearSteadyPing() {
        if (steadyTimer) {
            clearInterval(steadyTimer);
            steadyTimer = undefined;
        }
    }
}
