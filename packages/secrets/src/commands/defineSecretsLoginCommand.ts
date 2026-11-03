import { UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { readHiddenInput } from './utils/readHiddenInput.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets login`: has the mapping's store obtain its credentials.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsLoginCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsLoginCommand extends Command {
        static override paths = [['secrets', 'login']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Obtain credentials for the store',
            details: `
                Logs in to the store of the secrets mapping. The store asks for what it needs
                through a hidden prompt on a terminal, otherwise reads it from stdin; it is never
                taken from an argument.
            `,
            examples: [['Log in to the store', 'secrets login']],
        });

        override async run() {
            const { store } = this.container.resolve(options.provider);
            if (!store.login) {
                throw new UsageError(`Store ${store.id} has no login.`);
            }

            const stdin = this.context.stdin;
            await store.login(readAnswer);
            this.context.stdout.write(`Logged in to store ${store.id}.\n`);

            async function readAnswer(label: string) {
                const answer = await readHiddenInput(label, stdin);
                if (!answer.trim()) {
                    throw new UsageError(
                        `Nothing was entered (cancelled or empty); the login of store ${store.id} was not changed.`,
                    );
                }

                return answer;
            }
        }
    };
}
