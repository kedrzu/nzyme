/**
 * A CLI with the `secrets` commands over in-memory stores, run as a real process by
 * `defineSecretsCommands.test.ts` so `secrets run` can be observed on real stdio.
 */
import { execute } from '@nzyme/cli-core/execute.js';
import { defineService } from '@nzyme/ioc/Service.js';

import { SecretsProvider } from '../../SecretsProvider.js';
import type { SecretRef, SecretStore } from '../../SecretStore.js';
import { defineSecretStore } from '../../SecretStore.js';
import { defineSecretsCommands } from '../defineSecretsCommands.js';

/** The value of `API_KEY`, which must never reach anything but the child's environment. */
export const SENTINEL = 'sentinel-secret-value-run-4b2d';

const bw = createStore({ id: 'bw', data: { API_KEY: SENTINEL, DB_PASSWORD: 'db-pass' }, credentialEnv: ['BW_TOKEN'] });
// Referenced by a secret but not listed under `stores`: its credentials must be stripped too.
const vault = createStore({ id: 'vault', data: { SMTP_PASSWORD: 'smtp-pass' }, credentialEnv: ['VAULT_TOKEN'] });

const secrets: Record<string, SecretRef> = {
    API_KEY: bw.secret(),
    DB_PASSWORD: bw.secret(),
    SMTP_PASSWORD: vault.secret(),
};

if (process.env.FIXTURE_MISSING) {
    secrets.MISSING_ONE = bw.secret('NO_SUCH_KEY');
}

const AppSecrets = defineService({
    name: 'AppSecrets',
    implements: SecretsProvider,
    setup: () => ({ stores: { bw }, secrets }),
});

if (import.meta.main) {
    await execute({ name: 'fixture', commands: defineSecretsCommands({ provider: AppSecrets }) });
}

/** Options of {@link createStore}. */
interface CreateStoreOptions {
    id: string;
    /** The values the store holds, by key. */
    data: Record<string, string>;
    credentialEnv: string[];
}

function createStore(options: CreateStoreOptions): SecretStore {
    const { id, data, credentialEnv } = options;
    return defineSecretStore({
        id,
        credentialEnv,
        read(keys) {
            const found = new Map<string, string>();
            for (const key of keys) {
                const value = data[key];
                if (value !== undefined) {
                    found.set(key, value);
                }
            }

            return Promise.resolve(found);
        },
        write: () => Promise.resolve(),
    });
}
