/**
 * Options for navigating to a URL.
 */
export type NavigateToUrlOptions = {
    /**
     * The timeout in milliseconds for the best effort navigation handling.
     */
    timeout?: number;
};

/**
 * Result of navigating to a URL.
 */
export type NavigateToUrlResult = 'BLOCKED_OR_UNKNOWN' | 'NEW_WINDOW_LIKELY';

/**
 * Navigates to a URL and returns a Promise that resolves when the navigation is complete.
 *
 * @param url - The URL to navigate to
 * @param options - Additional options for navigation
 * @returns A Promise that resolves when the navigation is complete
 */
export function navigateToUrl(url: string, { timeout = 1500 } = {}) {
    return new Promise(resolve => {
        let resolved = false;
        let sawBlur = false;
        let sawHidden = false;

        const done = (result: NavigateToUrlResult) => {
            if (resolved) {
                return;
            }
            resolved = true;
            cleanup();
            resolve(result);
        };

        document.addEventListener('visibilitychange', onVisibility, { capture: true });
        window.addEventListener('blur', onBlur, { capture: true });

        // Kick off navigation
        window.location.assign(url);

        // Decide after a short window if no definitive signals fired
        setTimeout(() => {
            if (resolved) {
                return;
            }

            if (!sawHidden && sawBlur) {
                // Likely opened a new window (e.g., Arc Little Arc) while this tab stayed visible
                done('NEW_WINDOW_LIKELY');
            } else {
                done('BLOCKED_OR_UNKNOWN');
            }
        }, timeout);

        function cleanup() {
            document.removeEventListener('visibilitychange', onVisibility, { capture: true });
            window.removeEventListener('blur', onBlur, { capture: true });
        }

        function onVisibility() {
            if (document.visibilityState === 'hidden') {
                sawHidden = true;
                // Some browsers fire visibilitychange->hidden before unload
                // Treat as same-tab if followed by pagehide/unload, otherwise we decide at timeout
            }
        }

        function onBlur() {
            sawBlur = true;
        }
    });
}
