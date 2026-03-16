import { onWindowEvent } from './onWindowEvent.js';

/** Registers a passive window scroll listener that auto-removes on scope disposal. */
export function onWindowScroll(callback: () => void) {
    onWindowEvent('scroll', callback, { passive: true });
}
