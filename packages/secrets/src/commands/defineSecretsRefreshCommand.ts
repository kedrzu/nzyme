import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { getSecretStores } from '../getSecretStores.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets refresh`: re-reads the mapped secrets of every caching store.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRefreshCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRefreshCommand extends Command {
        static override paths = [['secrets', 'refresh']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Re-read the mapped secrets of every caching store',
            details:
                'Calls `refresh` on every store that has it, with the keys mapped to it. Other stores are left alone.',
        });

        override async run() {
            const mapping = this.container.resolve(options.provider);

            for (const store of getSecretStores(mapping)) {
                if (!store.refresh) {
                    continue;
                }

                const keys = new Set<string>();
                for (const [name, ref] of Object.entries(mapping.secrets)) {
                    if (ref.store === store) {
                        keys.add(ref.key ?? name);
                    }
                }

                await store.refresh([...keys]);
                this.context.stdout.write(`Refreshed store ${store.id}.\n`);
            }
        }
    };
}
