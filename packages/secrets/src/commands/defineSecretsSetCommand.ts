import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { promptSecret } from './promptSecret.js';
import { readHiddenInput } from './utils/readHiddenInput.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets set <NAME>`: writes one secret, its value read from a hidden prompt or
 * stdin, or with `--prompt` from a desktop dialog.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsSetCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsSetCommand extends Command {
        static override paths = [['secrets', 'set']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Write the value of a secret to its store',
            details: `
                The value is read from a hidden prompt on a terminal, otherwise from all of stdin
                (one trailing newline removed) — never from an argument. The project decides which store the
                name goes to (and may refuse it); the value is never printed.

                With \`--prompt\` the value is asked in a native masked dialog (osascript on macOS,
                Get-Credential on Windows, zenity or kdialog on Linux), falling back to a hidden prompt
                on a terminal; stdin is ignored. This lets an agent ask the user for a secret without
                the value reaching its transcript. \`--prompt=<hint>\` shows the hint in the dialog
                (the \`=\` is required). The value is trimmed and must be one line; only the name,
                store and character count are printed.
            `,
            examples: [
                ['Set a secret interactively', 'secrets set DB_PASSWORD'],
                ['Set a secret from a file', 'secrets set DB_PASSWORD < password.txt'],
                [
                    'Ask the user for a secret in a desktop dialog',
                    'secrets set DB_PASSWORD --prompt="Password of the staging database, in 1Password"',
                ],
            ],
        });

        name = Option.String({ required: true, name: 'NAME' });
        prompt = Option.String('--prompt', {
            tolerateBoolean: true,
            description: 'Ask for the value in a desktop dialog, showing the hint given as --prompt=<hint>',
        });

        override async run() {
            // Resolved first: a refused name throws here, before any prompt or write.
            const store = this.container.resolve(options.provider).target(this.name);

            const prompted = this.prompt !== undefined && this.prompt !== false;
            const value = prompted
                ? await this.readFromDialog()
                : await readHiddenInput(`Value of ${this.name}`, this.context.stdin);
            if (!value) {
                throw new UsageError(`The value of ${this.name} is empty; nothing was written.`);
            }

            await store.write([{ key: this.name, value }]);
            const length = prompted ? ` (${value.length} characters)` : '';
            this.context.stdout.write(`${this.name} written to store ${store.id}${length}.\n`);
        }

        /** The trimmed one-line value from `promptSecret`; every other outcome throws. */
        async readFromDialog() {
            const result = await promptSecret({
                name: this.name,
                hint: typeof this.prompt === 'string' ? this.prompt : undefined,
                stdin: this.context.stdin,
            });

            const value = result.status === 'entered' ? result.value.trim() : '';
            if (result.status === 'unavailable') {
                const binary = this.cli.binaryName;
                throw new UsageError(
                    `No desktop dialog or terminal is available here to ask for ${this.name}; nothing was written. ` +
                        `Ask the user to run \`${binary} secrets set ${this.name}\` in their own terminal, ` +
                        `then confirm with \`${binary} secrets list\`.`,
                );
            }

            if (!value) {
                throw new UsageError(
                    `Nothing was entered for ${this.name} (cancelled or timed out); nothing was written.`,
                );
            }

            if (/[\r\n]/.test(value)) {
                throw new UsageError(
                    `The value entered for ${this.name} spans several lines; nothing was written. ` +
                        `Pipe a multi-line value to \`secrets set ${this.name}\` on stdin, without --prompt.`,
                );
            }

            return value;
        }
    };
}
