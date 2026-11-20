import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { getHeader } from './gmailContent.js';

/**
 * Defines `<prefix> draft discard <id>`: moves the draft's message to the Trash. It refuses any
 * message not labelled `DRAFT`, and never deletes for good.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailDraftDiscardCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailDraftDiscardCommand extends Command {
        static override paths = [[...prefix.split(' '), 'draft', 'discard']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Move a draft to the Trash',
            details: `
                The draft stays in the Trash for 30 days and can be restored from there. A message
                not labelled \`DRAFT\` is refused; \`${prefix} thread label <id> --add TRASH\` trashes
                a thread.
            `,
        });

        id = Option.String({ name: 'id' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const { gmail, call } = await this.container.resolve(GmailClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const draft = await gmail.users.drafts.get({ userId: 'me', id: this.id, format: 'metadata' }, call);
            const message = draft.data.message;
            if (!message?.id || !message.labelIds?.includes('DRAFT')) {
                throw new Error(`${this.id} is not a draft - refusing to discard it.`);
            }

            // The Trash, never a permanent delete: a discarded draft stays recoverable.
            await gmail.users.messages.trash({ userId: 'me', id: message.id }, call);

            const subject = getHeader(message.payload?.headers, 'Subject');
            this.context.stdout.write(
                `Draft discarded: ${this.id} (message ${message.id}, thread ${message.threadId}, subject "${subject}"), ` +
                    'moved to the Trash for 30 days\n',
            );
        }
    };
}
