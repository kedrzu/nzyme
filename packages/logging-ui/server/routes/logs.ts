import { defineWebSocketHandler } from 'h3';

import { addViewer, getViewerCount, removeViewer } from '../utils/logBroadcaster.js';

/**
 * WebSocket endpoint for browser clients to receive logs.
 * Logs received on /ingest are broadcast to all clients connected here.
 */
export default defineWebSocketHandler({
    open(peer) {
        addViewer(peer);
        console.log(`[logs] Viewer connected: ${peer.id} (total: ${getViewerCount()})`);
    },

    close(peer) {
        removeViewer(peer);
        console.log(`[logs] Viewer disconnected: ${peer.id} (total: ${getViewerCount()})`);
    },

    error(peer, error) {
        console.error(`[logs] WebSocket error for ${peer.id}:`, error);
        removeViewer(peer);
    },
});
