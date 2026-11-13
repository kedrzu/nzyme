import type { SecretStore, SecretStoreEntry } from '../SecretStore.js';

/** Options of {@link createMemoryStore}. */
export interface MemoryStoreOptions {
    id: string;
    /** The secrets the store holds, by key (without prefix). */
    data?: Record<string, string>;
    credentialEnv?: string[];
    login?: boolean;
    refresh?: boolean;
}

/** An in-memory store that records what is asked of it. */
export function createMemoryStore(options: MemoryStoreOptions) {
    const data = new Map(Object.entries(options.data ?? {}));
    const writes: SecretStoreEntry[][] = [];
    const logins: string[] = [];
    const counter = { reads: 0, refreshes: 0 };

    const store: SecretStore = {
        id: options.id,
        credentialEnv: options.credentialEnv,
        readAll() {
            counter.reads++;
            return Promise.resolve(new Map(data));
        },
        write(entries) {
            writes.push(entries);
            return Promise.resolve();
        },
    };

    if (options.login) {
        store.login = async prompt => {
            logins.push(await prompt('Access token'));
        };
    }

    if (options.refresh) {
        store.refresh = () => {
            counter.refreshes++;
            return Promise.resolve();
        };
    }

    return {
        store,
        writes,
        logins,
        get reads() {
            return counter.reads;
        },
        get refreshes() {
            return counter.refreshes;
        },
    };
}
