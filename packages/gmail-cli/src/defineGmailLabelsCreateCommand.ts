import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { ensureLabel } from './ensureLabel.js';
import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';

/**
 * Defines `<prefix> labels create <name>`: creates a user label, or reports the existing one with that
 * name (matched case-insensitively), so running it twice is harmless.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailLabelsCreateCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailLabelsCreateCommand extends Command {
        static override paths = [[...prefix.split(' '), 'labels', 'create']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Create a label',
            details: `
                Does nothing when a label of that name exists already. A nested name
                (\`Clients/Acme\`) creates its parents too. Prints the label's id and name.
            `,
        });

        name = Option.String({ name: 'name' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const name = this.name.trim();
            if (!name) {
                throw new UsageError('The label name is empty.');
            }

            const client = await this.container.resolve(GmailClientFactory)(params, this.cli.binaryName, this.account);
            const labels = (await client.gmail.users.labels.list({ userId: 'me' }, client.call)).data.labels ?? [];
            const label = await ensureLabel({ client, labels, name });

            this.context.stdout.write(
                `${label.created ? 'Label created' : 'Label exists'}: ${label.id} ${label.name}\n`,
            );
        }
    };
}
