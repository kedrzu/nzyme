/**
 * A CLI with the `secrets` commands over in-memory stores, run as a real process by
 * `defineSecretsCommands.test.ts` so `secrets run` can be observed on real stdio.
 */
import { execute } from '@nzyme/cli-core/execute.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { SecretsMapping } from '../../SecretsMapping.js';
import type { SecretStore } from '../../SecretStore.js';
import { defineSecretsCommands } from '../defineSecretsCommands.js';

/** The value of `API_KEY`, which must never reach anything but the child's environment. */
export const SENTINEL = 'sentinel-secret-value-run-4b2d';

const bw = createStore({
    id: 'bw',
    data: { API_KEY: SENTINEL, DB_PASSWORD: 'db-pass', SMTP: 'smtp-pass' },
    credentialEnv: ['BW_TOKEN', 'BW_ORGANIZATION'],
});

const secrets: Record<string, string> = {
    API_KEY: 'API_KEY',
    DB_PASSWORD: 'DB_PASSWORD',
    SMTP_PASSWORD: 'SMTP',
};

if (process.env.FIXTURE_MISSING) {
    secrets.MISSING_ONE = 'NO_SUCH_KEY';
}

const AppSecrets = defineService<SecretsMapping>({
    name: 'AppSecrets',
    setup: () => ({ store: bw, secrets }),
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
    return {
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
    };
}
