const SERVICE = 'nzyme-secrets';

/**
 * A minimal keychain: named values kept in the operating system's secure storage.
 */
export interface Keychain {
    /** Resolves to `null` when nothing is stored under the name. */
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
    /** Resolves to whether anything was stored under the name. */
    delete(name: string): Promise<boolean>;
}

/**
 * The OS keychain (via `Bun.secrets`), under the `nzyme-secrets` service. Stores and the session
 * cache take it as an optional `keychain` option, so tests pass an in-memory one instead.
 */
export const osKeychain: Keychain = {
    get: name => Bun.secrets.get({ service: SERVICE, name }),
    set: (name, value) => Bun.secrets.set({ service: SERVICE, name, value }),
    delete: name => Bun.secrets.delete({ service: SERVICE, name }),
};
