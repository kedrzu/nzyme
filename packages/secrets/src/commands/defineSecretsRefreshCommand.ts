import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets refresh`: re-reads the mapped secrets when the store caches them.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRefreshCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRefreshCommand extends Command {
        static override paths = [['secrets', 'refresh']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Re-read the mapped secrets into the store cache',
            details: "Calls the store's `refresh` with every mapped key. A store that does not cache is left alone.",
        });

        override async run() {
            const { store, secrets } = this.container.resolve(options.provider);
            if (!store.refresh) {
                this.context.stdout.write(`Store ${store.id} keeps no cache; nothing to refresh.\n`);
                return;
            }

            await store.refresh([...new Set(Object.values(secrets))]);
            this.context.stdout.write(`Refreshed store ${store.id}.\n`);
        }
    };
}
