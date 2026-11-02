import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { readHiddenInput } from './readHiddenInput.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';
import { selectSecretStore } from './selectSecretStore.js';

/**
 * Defines `secrets login [alias]`: has a store obtain its credentials.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsLoginCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsLoginCommand extends Command {
        static override paths = [['secrets', 'login']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Obtain credentials for a store',
            details: `
                Logs in to the store with the given alias (optional with one store). The store asks
                for what it needs through a hidden prompt on a terminal, otherwise reads it from stdin;
                it is never taken from an argument.
            `,
            examples: [
                ['Log in to the only store', 'secrets login'],
                ['Log in to the bw store', 'secrets login bw'],
            ],
        });

        alias = Option.String({ required: false, name: 'alias' });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const { alias, store } = selectSecretStore(mapping, this.alias);
            if (!store.login) {
                throw new UsageError(`Store "${alias}" has no login.`);
            }

            const stdin = this.context.stdin;
            await store.login({ prompt: readAnswer });
            this.context.stdout.write(`Logged in to store ${store.id}.\n`);

            async function readAnswer(label: string) {
                const answer = await readHiddenInput(label, stdin);
                if (!answer.trim()) {
                    throw new UsageError(
                        `Nothing was entered (cancelled or empty); the login of store "${alias}" was not changed.`,
                    );
                }

                return answer;
            }
        }
    };
}
