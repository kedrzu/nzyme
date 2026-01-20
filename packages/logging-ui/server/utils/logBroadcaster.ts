import type { Peer } from 'crossws';

import type { LogEntry } from '../../types/LogEntry.js';
import { toJsonString } from '@nzyme/utils';

/**
 * Set of connected browser clients (viewers).
 */
const viewers = new Set<Peer>();

/**
 * Add a viewer connection.
 */
export function addViewer(peer: Peer): void {
    viewers.add(peer);
}

/**
 * Remove a viewer connection.
 */
export function removeViewer(peer: Peer): void {
    viewers.delete(peer);
}

/**
 * Broadcast a log entry to all connected viewers.
 */
export function broadcastLog(log: LogEntry): void {
    const message = toJsonString(log);
    for (const viewer of viewers) {
        try {
            viewer.send(message);
        } catch {
            // Remove failed viewers
            viewers.delete(viewer);
        }
    }
}

/**
 * Get the number of connected viewers.
 */
export function getViewerCount(): number {
    return viewers.size;
}
