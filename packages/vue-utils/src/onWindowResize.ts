import { onWindowEvent } from './onWindowEvent.js';

export function onWindowResize(callback: () => void) {
    onWindowEvent('resize', callback, { passive: true });
}
