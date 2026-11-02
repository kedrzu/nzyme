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
                Logs in to the store with the given alias (optional with one store), read access
                unless \`--write\` is given. The store asks for what it needs through a hidden prompt
                on a terminal, otherwise reads it from stdin; it is never taken from an argument.
            `,
            examples: [
                ['Log in for reading', 'secrets login'],
                ['Log in to the bw store for writing', 'secrets login bw --write'],
            ],
        });

        alias = Option.String({ required: false, name: 'alias' });
        write = Option.Boolean('--write', false, { description: 'Obtain write access instead of read access' });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const { alias, store } = selectSecretStore(mapping, this.alias);
            if (!store.login) {
                throw new UsageError(`Store "${alias}" has no login.`);
            }

            const access = this.write ? 'write' : 'read';
            const stdin = this.context.stdin;
            await store.login({ access, prompt: label => readHiddenInput(label, stdin) });
            this.context.stdout.write(`Logged in to store ${store.id} for ${access} access.\n`);
        }
    };
}
