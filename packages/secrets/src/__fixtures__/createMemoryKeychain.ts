import type { Keychain } from '../osKeychain.js';

/**
 * An in-memory {@link Keychain}. `failSet` names items whose `set` rejects, to test an interrupted write.
 */
export function createMemoryKeychain(options: { failSet?: (name: string) => boolean } = {}) {
    const values = new Map<string, string>();
    const keychain: Keychain = {
        get: name => Promise.resolve(values.get(name) ?? null),
        set: (name, value) => {
            if (options.failSet?.(name)) {
                return Promise.reject(new Error(`keychain refused to set ${name}`));
            }

            values.set(name, value);
            return Promise.resolve();
        },
        delete: name => Promise.resolve(values.delete(name)),
    };

    return { ...keychain, values };
}
