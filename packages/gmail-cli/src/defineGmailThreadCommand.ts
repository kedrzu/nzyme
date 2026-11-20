import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { formatGmailMessage } from './formatGmailMessage.js';
import { createGmailClient } from './createGmailClient.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { readLabelNames } from './readLabelNames.js';

/**
 * Defines `<prefix> thread <id> [--raw]`: every message of the thread as Markdown, oldest first, each
 * under its header block, separated by `---` lines.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailThreadCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailThreadCommand extends Command {
        static override paths = [[...prefix.split(' '), 'thread']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Read a thread as Markdown',
            details: `
                Prints each message under a \`key: value\` header block (from, to, cc, date, labels by
                name, attachments by part id), then its body as Markdown with quoted replies and
                signatures stripped. \`--raw\` prints the original HTML or text instead. Save an
                attachment with \`${prefix} attachment save <messageId> <partId>\`.
            `,
        });

        id = Option.String({ name: 'id' });
        raw = Option.Boolean('--raw', false, { description: 'Print the original HTML or text bodies' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const client = await createGmailClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const [thread, labelNames] = await Promise.all([
                client.gmail.users.threads.get({ userId: 'me', id: this.id, format: 'full' }, client.call),
                readLabelNames(client),
            ]);

            const messages = (thread.data.messages ?? []).map(message =>
                formatGmailMessage(message, { labelNames, raw: this.raw }),
            );
            this.context.stdout.write(messages.join('\n---\n\n'));
        }
    };
}
