import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { readHiddenInput } from './readHiddenInput.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets set <NAME>`: writes one mapped secret, its value read from a hidden prompt or stdin.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsSetCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsSetCommand extends Command {
        static override paths = [['secrets', 'set']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Write the value of a mapped secret to its store',
            details: `
                The value is read from a hidden prompt on a terminal, otherwise from all of stdin
                (one trailing newline removed) — never from an argument. It is written to the store
                and key the name is mapped to, and never printed.
            `,
            examples: [
                ['Set a secret interactively', 'secrets set DB_PASSWORD'],
                ['Set a secret from a file', 'secrets set DB_PASSWORD < password.txt'],
            ],
        });

        name = Option.String({ required: true, name: 'NAME' });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const ref = mapping.secrets[this.name];
            if (!ref) {
                throw new UsageError(`${this.name} is not a mapped secret.`);
            }

            const value = await readHiddenInput(`Value of ${this.name}`, this.context.stdin);
            if (!value) {
                throw new UsageError(`The value of ${this.name} is empty; nothing was written.`);
            }

            const key = ref.key ?? this.name;
            await ref.store.write([{ key, value }]);
            this.context.stdout.write(`${this.name} written to key ${key} in store ${ref.store.id}.\n`);
        }
    };
}
