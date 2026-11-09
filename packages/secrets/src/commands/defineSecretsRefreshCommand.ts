import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets refresh`: re-reads every store that caches.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRefreshCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRefreshCommand extends Command {
        static override paths = [['secrets', 'refresh']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Re-read the stores into their caches',
            details: 'Calls `refresh` on every store that has one. A store that does not cache is left alone.',
        });

        override async run() {
            const { stores } = this.container.resolve(options.provider);
            for (const store of stores) {
                if (!store.refresh) {
                    this.context.stdout.write(`Store ${store.id} keeps no cache; nothing to refresh.\n`);
                    continue;
                }

                await store.refresh();
                this.context.stdout.write(`Refreshed store ${store.id}.\n`);
            }
        }
    };
}
