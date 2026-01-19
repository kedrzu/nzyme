import { defineWebSocketHandler } from 'h3';

import type { LogEntry } from '../../types/LogEntry.js';
import { broadcastLog } from '../utils/logBroadcaster.js';

/**
 * WebSocket endpoint for receiving logs from backend apps.
 * Logs are broadcast to all connected viewer clients.
 */
export default defineWebSocketHandler({
    open(peer) {
        console.log(`[ingest] Producer connected: ${peer.id}`);
    },

    message(peer, message) {
        try {
            const text = message.text();
            const log = JSON.parse(text) as LogEntry;

            // Validate required fields
            if (!log.id || !log.app || !log.level || !log.message) {
                console.warn('[ingest] Invalid log entry received:', text);
                return;
            }

            // Broadcast to all connected viewers
            broadcastLog(log);
        } catch (err) {
            console.error('[ingest] Failed to parse log message:', err);
        }
    },

    close(peer) {
        console.log(`[ingest] Producer disconnected: ${peer.id}`);
    },

    error(peer, error) {
        console.error(`[ingest] WebSocket error for ${peer.id}:`, error);
    },
});
