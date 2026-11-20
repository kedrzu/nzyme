import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { findAttachment, savedFileName } from './attachments.js';
import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { extractAttachments } from './gmailContent.js';
import { attachmentsDir } from './localFiles.js';
import { formatFileSize } from './utils/formatFileSize.js';

/**
 * Defines `<prefix> attachment save <messageId> <partId>`: writes the attachment to
 * `<attachmentsDir>/<messageId>/<safe file name>` and prints its path. The bytes never reach the
 * output, and nothing is written outside the attachments directory.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailAttachmentSaveCommand(params: GmailCommandParams): CommandClass {
    const { prefix, files } = params;

    return class GmailAttachmentSaveCommand extends Command {
        static override paths = [[...prefix.split(' '), 'attachment', 'save']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Save an attachment to disk',
            details: `
                Downloads the attachment to the attachments directory, one folder per message, and
                prints the saved path; the path can be attached to a draft as is. The part id comes
                from the \`attachment:\` lines of \`${prefix} thread\` or \`${prefix} message\`.
            `,
            examples: [['Save the second part', `${prefix} attachment save 18c2f0a1b2c3d4e5 2`]],
        });

        messageId = Option.String({ name: 'messageId' });
        partId = Option.String({ name: 'partId' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            // The id names a directory: anything but Gmail's id characters could leave the root.
            if (!/^[\w-]+$/.test(this.messageId)) {
                throw new UsageError(`'${this.messageId}' is not a Gmail message id.`);
            }

            const { gmail, call } = await this.container.resolve(GmailClientFactory)({
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const message = await gmail.users.messages.get({ userId: 'me', id: this.messageId, format: 'full' }, call);
            const { payload } = message.data;
            assert(payload, `Gmail returned message ${this.messageId} without its content`);

            const attachments = extractAttachments(payload);
            const target = findAttachment(attachments, this.partId);
            if (!target) {
                const available = attachments.map(a => `${a.partId} (${a.filename})`).join(', ') || 'none';
                throw new UsageError(
                    `Message ${this.messageId} has no attachment '${this.partId}'; available: ${available}.`,
                );
            }

            const dir = path.join(path.resolve(attachmentsDir(files)), this.messageId);
            const dest = path.join(dir, savedFileName(target, attachments));
            if (path.dirname(dest) !== dir) {
                throw new Error(`Refusing to write ${dest}: it is outside ${dir}`);
            }

            const attachment = await gmail.users.messages.attachments.get(
                { userId: 'me', messageId: this.messageId, id: target.gmailId },
                call,
            );
            const content = Buffer.from(attachment.data.data ?? '', 'base64url');
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(dest, content);

            this.context.stdout.write(
                `Saved part ${target.partId} of ${this.messageId}: ${dest} (${target.mimeType}, ${formatFileSize(content.length)})\n`,
            );
        }
    };
}
