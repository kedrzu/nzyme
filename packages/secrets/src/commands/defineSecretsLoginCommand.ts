import { UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { readHiddenInput } from './utils/readHiddenInput.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets login`: has every store that logs in obtain its credentials.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsLoginCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsLoginCommand extends Command {
        static override paths = [['secrets', 'login']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Obtain credentials for the stores',
            details: `
                Logs in to each store that has a login. A store asks for what it needs
                through a hidden prompt on a terminal, otherwise reads it from stdin; it is never
                taken from an argument.
            `,
            examples: [['Log in to the stores', 'secrets login']],
        });

        override async run() {
            const { stores } = this.container.resolve(options.provider);
            const loggable = stores.filter(store => store.login !== undefined);
            if (loggable.length === 0) {
                throw new UsageError('None of the stores has a login.');
            }

            const stdin = this.context.stdin;
            for (const store of loggable) {
                await store.login?.(label => readAnswer(store.id, label));
                this.context.stdout.write(`Logged in to store ${store.id}.\n`);
            }

            async function readAnswer(storeId: string, label: string) {
                const answer = await readHiddenInput(label, stdin);
                if (!answer.trim()) {
                    throw new UsageError(
                        `Nothing was entered (cancelled or empty); the login of store ${storeId} was not changed.`,
                    );
                }

                return answer;
            }
        }
    };
}
