import type { LogEntry } from '../types/LogEntry.js';

const DB_NAME = 'logging-ui';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

/**
 * Opens (or creates) the IndexedDB database.
 * Returns null if IndexedDB is unavailable or open fails.
 */
function openDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }

        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.warn('[logsIndexedDb] Failed to open database:', request.error);
                resolve(null);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = event => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object store with 'id' as key path
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    // Create index on timestamp for ordering
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        } catch (err) {
            console.warn('[logsIndexedDb] Error opening database:', err);
            resolve(null);
        }
    });
}

/**
 * Load logs from IndexedDB, ordered by timestamp descending (newest first).
 * Returns at most `limit` entries.
 */
export async function loadLogs(limit: number): Promise<LogEntry[]> {
    const db = await openDb();
    if (!db) {
        return [];
    }

    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('timestamp');

            const logs: LogEntry[] = [];

            // Iterate in reverse order (newest first)
            const request = index.openCursor(null, 'prev');

            request.onerror = () => {
                console.warn('[logsIndexedDb] Failed to load logs:', request.error);
                resolve([]);
            };

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor && logs.length < limit) {
                    logs.push(cursor.value as LogEntry);
                    cursor.continue();
                } else {
                    resolve(logs);
                }
            };

            transaction.oncomplete = () => {
                db.close();
            };

            transaction.onerror = () => {
                console.warn('[logsIndexedDb] Transaction error loading logs:', transaction.error);
                db.close();
                resolve([]);
            };
        } catch (err) {
            console.warn('[logsIndexedDb] Error loading logs:', err);
            db.close();
            resolve([]);
        }
    });
}

/**
 * Persist a single log entry to IndexedDB.
 */
export async function putLog(log: LogEntry): Promise<void> {
    const db = await openDb();
    if (!db) {
        return;
    }

    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.put(log);

            request.onerror = () => {
                console.warn('[logsIndexedDb] Failed to put log:', request.error);
            };

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                resolve();
            };
        } catch (err) {
            console.warn('[logsIndexedDb] Error putting log:', err);
            db.close();
            resolve();
        }
    });
}

/**
 * Delete multiple log entries by their IDs.
 */
export async function deleteLogs(ids: string[]): Promise<void> {
    if (ids.length === 0) {
        return;
    }

    const db = await openDb();
    if (!db) {
        return;
    }

    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            for (const id of ids) {
                store.delete(id);
            }

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                console.warn('[logsIndexedDb] Failed to delete logs:', transaction.error);
                db.close();
                resolve();
            };
        } catch (err) {
            console.warn('[logsIndexedDb] Error deleting logs:', err);
            db.close();
            resolve();
        }
    });
}

/**
 * Clear all logs from IndexedDB.
 */
export async function clearAllLogs(): Promise<void> {
    const db = await openDb();
    if (!db) {
        return;
    }

    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.clear();

            request.onerror = () => {
                console.warn('[logsIndexedDb] Failed to clear logs:', request.error);
            };

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                resolve();
            };
        } catch (err) {
            console.warn('[logsIndexedDb] Error clearing logs:', err);
            db.close();
            resolve();
        }
    });
}
