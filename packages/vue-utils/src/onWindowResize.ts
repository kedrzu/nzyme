import { onWindowEvent } from './onWindowEvent.js';

/** Registers a passive window resize listener that auto-removes on scope disposal. */
export function onWindowResize(callback: () => void) {
    onWindowEvent('resize', callback, { passive: true });
}
