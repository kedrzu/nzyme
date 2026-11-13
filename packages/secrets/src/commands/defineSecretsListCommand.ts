import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { readStores } from '../utils/readStores.js';
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
            `,
        });

        override async run() {
            const { stores } = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);

            for (const { storeId, secrets } of await readStores(stores)) {
                for (const key of [...secrets.keys()].toSorted()) {
                    const status = env[key] ? '  overridden by environment' : '';
                    this.context.stdout.write(`${key}  ${storeId}${status}\n`);
                }
            }
        }
    };
}
