import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { getSecretStores } from '../utils/getSecretStores.js';
import { groupSecretsByStore } from '../utils/groupSecretsByStore.js';
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

            const byStore = groupSecretsByStore(mapping.secrets);

            for (const store of getSecretStores(mapping)) {
                if (!store.refresh) {
                    continue;
                }

                const entries = byStore.get(store) ?? [];
                const keys = new Set(entries.map(entry => entry.key));
                await store.refresh([...keys]);
                this.context.stdout.write(`Refreshed store ${store.id}.\n`);
            }
        }
    };
}
