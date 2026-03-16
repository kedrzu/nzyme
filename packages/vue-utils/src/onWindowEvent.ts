import { onScopeDispose } from 'vue';

import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';

/** Adds a typed window event listener that auto-removes on scope disposal. */
export function onWindowEvent<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
): void;
/** Adds a window event listener that auto-removes on scope disposal. */
export function onWindowEvent(
    type: string,
    listener: (this: Window, ev: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
): void;
/** Adds a window event listener that auto-removes on scope disposal. */
export function onWindowEvent(
    type: string,
    listener: (this: Window, ev: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
): void {
    if (!isBrowser()) {
        return;
    }

    window.addEventListener(type, listener, options);

    onScopeDispose(() => {
        window.removeEventListener(type, listener, options);
    });
}
