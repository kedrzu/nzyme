import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { formatTsvLine } from './utils/formatTsvLine.js';

/**
 * Defines `<prefix> labels list`: one line per label, `id  name  type` (`system` or `user`),
 * tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailLabelsListCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailLabelsListCommand extends Command {
        static override paths = [[...prefix.split(' '), 'labels', 'list']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'List the labels of an account',
            details: 'Prints one tab-separated line per label: its id, name and type (`system` or `user`).',
        });

        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const client = await this.container.resolve(GmailClientFactory)(params, this.cli.binaryName, this.account);
            const response = await client.gmail.users.labels.list({ userId: 'me' }, client.call);
            for (const label of response.data.labels ?? []) {
                this.context.stdout.write(formatTsvLine([label.id ?? '', label.name ?? '', label.type ?? '']));
            }
        }
    };
}
