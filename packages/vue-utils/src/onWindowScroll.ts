import { onWindowEvent } from './onWindowEvent.js';

/**
 *
 */
export function onWindowScroll(callback: () => void) {
    onWindowEvent('scroll', callback, { passive: true });
}
