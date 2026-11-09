/**
 * Asks the user for a hidden value (a password, a token) and resolves to what they typed.
 */
export type SecretPrompt = (label: string) => Promise<string>;

/**
 * One entry passed to {@link SecretStore.write}.
 */
export interface SecretStoreEntry {
    /** The key without the store's prefix; the store adds it. */
    key: string;
    value: string;
}

/**
 * A remote (or local) place secrets are read from and written to, scoped to a prefix. A store owns
 * its credentials.
 */
export interface SecretStore {
    /** Stable identity of the store (for Bitwarden: server, project and prefix); names it in output. */
    id: string;
    /**
     * The part of the store this one covers. Arbitrary: a path such as `/secrets/dev/` or a name prefix
     * such as `FOOBAR_`. Empty means the whole store.
     */
    prefix: string;
    /** Reads every secret under the prefix, keyed without it. */
    readAll(): Promise<Map<string, string>>;
    /** Creates or updates the given entries (keys without the prefix). */
    write(entries: SecretStoreEntry[]): Promise<void>;
    /** Obtains the store's credentials, asking the user through `prompt` when needed. */
    login?(prompt: SecretPrompt): Promise<void>;
    /** Re-reads the store's secrets; implemented only by stores that cache. */
    refresh?(): Promise<void>;
    /** Environment variable names holding this store's credentials, stripped from a child process. */
    credentialEnv?: string[];
}
