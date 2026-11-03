/**
 * Asks the user for a hidden value (a password, a token) and resolves to what they typed.
 */
export type SecretPrompt = (label: string) => Promise<string>;

/**
 * One entry passed to {@link SecretStore.write}.
 */
export interface SecretStoreEntry {
    key: string;
    value: string;
}

/**
 * A remote (or local) place secrets are read from and written to. A store owns its credentials.
 */
export interface SecretStore {
    /** Stable identity of the store (for Bitwarden: server and project); used as the cache key. */
    id: string;
    /** Reads keys in one batch. A key the store does not have is absent from the result. */
    read(keys: string[]): Promise<Map<string, string>>;
    /** Creates or updates the given entries. */
    write(entries: SecretStoreEntry[]): Promise<void>;
    /** Obtains the store's credentials, asking the user through `prompt` when needed. */
    login?(prompt: SecretPrompt): Promise<void>;
    /** Re-fetches the given keys; implemented only by stores that cache. */
    refresh?(keys: string[]): Promise<void>;
    /** Environment variable names holding this store's credentials, stripped from a child process. */
    credentialEnv?: string[];
}
