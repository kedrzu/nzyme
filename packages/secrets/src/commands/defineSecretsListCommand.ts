import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { readStores } from '../utils/readStores.js';
import type { StoreSecrets } from '../utils/readStores.js';
import { getSecretDeclarations } from './utils/getSecretDeclarations.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets list`: every key of every store with its store id — never a value.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsListCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsListCommand extends Command {
        static override paths = [['secrets', 'list']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'List the keys of every store',
            details: `
                Prints each key of each store with the store id, and \`overridden by environment\`
                when the variable of that name is set. Values are never printed.

                When the project declares its secrets, it prints each declared secret enabled in this
                environment with the store holding it, or \`missing\`; then each stored key not
                declared (\`not declared\`) or declared but not enabled here (\`not enabled here\`).
                A missing secret does not fail the command.
            `,
        });

        override async run() {
            const { stores, secrets: declared } = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);
            const read = await readStores(stores);
            const stdout = this.context.stdout;

            if (!declared) {
                for (const { storeId, secrets } of read) {
                    for (const key of [...secrets.keys()].toSorted()) {
                        stdout.write(`${key}  ${storeId}${overriddenSuffix(key)}\n`);
                    }
                }

                return;
            }

            const { enabled, disabled } = getSecretDeclarations(declared, env);
            for (const name of enabled) {
                stdout.write(`${name}  ${findStoreId(read, name) ?? 'missing'}${overriddenSuffix(name)}\n`);
            }

            for (const { storeId, secrets } of read) {
                for (const key of [...secrets.keys()].toSorted()) {
                    if (disabled.has(key)) {
                        stdout.write(`${key}  ${storeId}  not enabled here\n`);
                    } else if (!enabled.includes(key)) {
                        stdout.write(`${key}  ${storeId}  not declared\n`);
                    }
                }
            }

            function overriddenSuffix(key: string) {
                return env[key] ? '  overridden by environment' : '';
            }
        }
    };
}

/** The first store holding a non-empty value for `key`: the one `run` would read it from. */
function findStoreId(read: StoreSecrets[], key: string): string | undefined {
    return read.find(({ secrets }) => secrets.get(key))?.storeId;
}
