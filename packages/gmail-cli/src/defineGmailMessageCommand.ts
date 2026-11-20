import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { formatGmailMessage } from './formatGmailMessage.js';
import { createGmailClient } from './createGmailClient.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { readLabelNames } from './readLabelNames.js';

/**
 * Defines `<prefix> message <id> [--raw]`: one message as Markdown under its header block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailMessageCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailMessageCommand extends Command {
        static override paths = [[...prefix.split(' '), 'message']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Read one message as Markdown',
            details: `
                Prints a \`key: value\` header block (thread, from, to, cc, date, labels by name,
                attachments by part id), then the body as Markdown with quoted replies and signatures
                stripped. \`--raw\` prints the original HTML or text instead.
            `,
        });

        id = Option.String({ name: 'id' });
        raw = Option.Boolean('--raw', false, { description: 'Print the original HTML or text body' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const client = await createGmailClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const [message, labelNames] = await Promise.all([
                client.gmail.users.messages.get({ userId: 'me', id: this.id, format: 'full' }, client.call),
                readLabelNames(client),
            ]);

            this.context.stdout.write(formatGmailMessage(message.data, { labelNames, raw: this.raw }));
        }
    };
}
