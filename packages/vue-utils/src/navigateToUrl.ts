/**
 * Navigates to a URL and preserves the scroll position.
 * @param url - The URL to navigate to
 */
export function navigateToUrl(url: string) {
    let currentState = history.state as unknown;
    if (typeof currentState !== 'object') {
        currentState = {};
    }

    const state = {
        ...(currentState as object),
        scroll: {
            left: window.scrollX,
            top: window.scrollY,
        },
    };

    window.history.replaceState(state, '');
    window.location.assign(url);
}
