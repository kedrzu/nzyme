const isSupported = typeof window === 'object' && 'requestIdleCallback' in window;

/**
 * Polyfilled version of `window.requestIdleCallback`.
 */
export const requestIdleCallback: (typeof window)['requestIdleCallback'] = isSupported
    ? window.requestIdleCallback.bind(window)
    : (callback, options) => setTimeout(callback, options?.timeout || 500);

/**
 * Polyfilled version of `window.cancelIdleCallback`.
 */
export const cancelIdleCallback: (typeof window)['cancelIdleCallback'] = isSupported
    ? window.cancelIdleCallback.bind(window)
    : clearTimeout;
