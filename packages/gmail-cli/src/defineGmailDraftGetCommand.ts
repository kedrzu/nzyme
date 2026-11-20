import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { draftBodyToMarkdown, extractAttachments, formatFileSize, getHeader } from './gmailContent.js';
import { formatHeaderBlock } from './utils/formatHeaderBlock.js';

/**
 * Defines `<prefix> draft get <id>`: the draft under a `key: value` header block, its body as the
 * Markdown it was written in, without the signature and quote an update regenerates.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailDraftGetCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailDraftGetCommand extends Command {
        static override paths = [[...prefix.split(' '), 'draft', 'get']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Read a draft as Markdown',
            details: `
                Prints a \`key: value\` header block (draft, message and thread ids, recipients,
                subject, one \`attachment: <filename> <mimeType> <size>\` line each, \`inline\` for an
                embedded image), then the body as Markdown without the signature and the quote, ready
                to edit and pass to \`${prefix} draft update <id> --body-file\`.
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
            const draft = await gmail.users.drafts.get({ userId: 'me', id: this.id, format: 'full' }, call);
            const message = draft.data.message;
            if (!message?.payload) {
                throw new Error(`Draft ${this.id} has no message`);
            }

            const headers = message.payload.headers;
            const fields: [string, string][] = [
                ['draft', draft.data.id ?? this.id],
                ['id', message.id ?? ''],
                ['thread', message.threadId ?? ''],
                ['from', getHeader(headers, 'From')],
                ['to', getHeader(headers, 'To')],
                ['cc', getHeader(headers, 'Cc')],
                ['bcc', getHeader(headers, 'Bcc')],
                ['subject', getHeader(headers, 'Subject')],
                ['in-reply-to', getHeader(headers, 'In-Reply-To')],
                ...extractAttachments(message.payload).map((a): [string, string] => [
                    'attachment',
                    `${a.filename} ${a.mimeType} ${formatFileSize(a.size)}${a.inline ? ' inline' : ''}`,
                ]),
            ];
            this.context.stdout.write(`${formatHeaderBlock(fields)}\n${draftBodyToMarkdown(message.payload)}\n`);
        }
    };
}
