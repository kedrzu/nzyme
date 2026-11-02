/**
 * Asks the user for a hidden value (a password, a token) and resolves to what they typed.
 */
export type SecretPrompt = (label: string) => Promise<string>;

/**
 * What a store's `login` is given: how to ask the user for credentials.
 */
export interface SecretStoreLoginContext {
    prompt: SecretPrompt;
}

/**
 * One entry passed to {@link SecretStore.write}.
 */
export interface SecretStoreEntry {
    key: string;
    value: string;
}

/**
 * A reference to one secret in one store.
 */
export interface SecretRef {
    store: SecretStore;
    /** The key in the store; `undefined` means the name the ref is mapped to. */
    key: string | undefined;
}

/**
 * A remote (or local) place secrets are read from and written to. A store owns its credentials.
 */
export interface SecretStore {
    /** Stable identity of the store (for Bitwarden: server and project); used as the cache key. */
    id: string;
    /** References a secret in this store; without a key, the name it is mapped to is the key. */
    secret(key?: string): SecretRef;
    /** Reads keys in one batch. A key the store does not have is absent from the result. */
    read(keys: string[]): Promise<Map<string, string>>;
    /** Creates or updates the given entries. */
    write(entries: SecretStoreEntry[]): Promise<void>;
    /** Obtains the store's credentials, prompting the user when needed. */
    login?(context: SecretStoreLoginContext): Promise<void>;
    /** Re-fetches the given keys; implemented only by stores that cache. */
    refresh?(keys: string[]): Promise<void>;
    /** Environment variable names holding this store's credentials, stripped from a child process. */
    credentialEnv?: string[];
}

/**
 * Everything a store implements; {@link defineSecretStore} adds `secret`.
 */
export type SecretStoreDefinition = Omit<SecretStore, 'secret'>;

/**
 * Defines a secret store, adding the `secret()` reference factory to its implementation.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretStore(definition: SecretStoreDefinition): SecretStore {
    const store: SecretStore = { ...definition, secret };
    return store;

    function secret(key?: string): SecretRef {
        return { store, key };
    }
}
