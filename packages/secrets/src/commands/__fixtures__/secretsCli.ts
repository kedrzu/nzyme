/**
 * A CLI with the `secrets` commands over in-memory stores, run as a real process by
 * `defineSecretsCommands.test.ts` so `secrets run` can be observed on real stdio.
 */
import { execute } from '@nzyme/cli-core/execute.js';
import { defineService } from '@nzyme/ioc/Service.js';

import { createMemoryKeychain } from '../../__fixtures__/createMemoryKeychain.js';
import { createMemoryStore } from '../../__fixtures__/createMemoryStore.js';
import { keychainStore } from '../../keychainStore.js';
import type { SecretStore } from '../../SecretStore.js';
import { defineSecretsCommands } from '../defineSecretsCommands.js';
import type { SecretsProvider } from '../SecretsCommandsOptions.js';

/** The value of `API_KEY`, which must never reach anything but the child's environment. */
export const SENTINEL = 'sentinel-secret-value-run-4b2d';

const bw = createMemoryStore({
    id: 'bw',
    data: { API_KEY: SENTINEL, DB_PASSWORD: 'db-pass' },
    credentialEnv: ['BW_TOKEN', 'BW_ORGANIZATION'],
});

// `DB_PASSWORD` is also here, but the earlier store wins it.
const extra = createMemoryStore({
    id: 'extra',
    data: { DB_PASSWORD: 'shadowed', SMTP_PASSWORD: 'smtp-pass' },
    credentialEnv: ['EXTRA_TOKEN'],
});

/** The value of `KEYCHAIN_KEY`, held only by the keychain store. */
export const KEYCHAIN_VALUE = 'keychain-secret-value-run-7c3a';

const keychain = keychainStore({ scope: 'fixture', keychain: createMemoryKeychain() });
await keychain.write([{ key: 'KEYCHAIN_KEY', value: KEYCHAIN_VALUE }]);

const unreadable: SecretStore = {
    id: 'unreadable',
    readAll: () => Promise.reject(new Error('Store unreachable')),
    write: () => Promise.resolve(),
};

const stores = process.env.FIXTURE_UNREADABLE ? [bw.store, extra.store, keychain, unreadable] : [bw.store, extra.store, keychain];

const AppSecrets = defineService<SecretsProvider>({
    name: 'AppSecrets',
    setup: () => ({ stores, target: () => bw.store }),
});

if (import.meta.main) {
    await execute({ name: 'fixture', commands: defineSecretsCommands({ provider: AppSecrets }) });
}
