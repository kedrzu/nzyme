import type { Readable } from 'node:stream';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { buildDraftBody, buildMime, buildReferences } from './compose.js';
import { draftMedia } from './draftMedia.js';
import { formatDraftFiles } from './formatDraftFiles.js';
import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { assertTotalSize, draftFileAccess, loadLocalFile } from './localFiles.js';
import { readDraftBody } from './readDraftBody.js';
import { readReplyContext } from './readReplyContext.js';
import { readSignature } from './readSignature.js';

/**
 * Defines `<prefix> draft create`: a draft written in Markdown (or HTML), with the account's Gmail
 * signature, and in a thread the reply headers and the quote of its last message. It never sends.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailDraftCreateCommand(params: GmailCommandParams): CommandClass {
    const { prefix, files, reply: attribution } = params;

    return class GmailDraftCreateCommand extends Command {
        static override paths = [[...prefix.split(' '), 'draft', 'create']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Create a draft from Markdown; never sends',
            details: `
                The body is Markdown, read from \`--body-file <path>\` or stdin (\`--body-file -\`, or
                piped); \`--html\` takes HTML instead. Local images in the body (\`![](./chart.png)\`)
                are embedded inline. The account's Gmail signature is appended unless
                \`--no-signature\`.

                With \`--thread\` the draft replies in that thread: recipient, subject and reply
                headers default to its last message (to its recipients when that message is the
                account's own), which is quoted below the signature unless \`--no-quote\`.

                Attachments and inline images are read from the project directory, the configured
                roots or the attachments directory; secret files are refused. Every file is read
                before anything is written, so a bad path makes no draft. Prints the draft id; review
                and send it in Gmail.
            `,
            examples: [
                ['A new message', `${prefix} draft create --to jan@example.com --subject Hello --body-file body.md`],
                [
                    'Reply in a thread',
                    `${prefix} draft create --thread 18c2f0a1b2c3d4e5 --attach report.pdf < reply.md`,
                ],
            ],
        });

        to = Option.String('--to', { description: 'Recipients, comma-separated; defaults to the reply recipient' });
        cc = Option.String('--cc', { description: 'Cc recipients, comma-separated' });
        bcc = Option.String('--bcc', { description: 'Bcc recipients, comma-separated' });
        subject = Option.String('--subject', { description: 'The subject; defaults to "Re: …" of the thread' });
        thread = Option.String('--thread', { description: 'The thread to reply in' });
        inReplyTo = Option.String('--in-reply-to', { description: 'The Message-ID replied to, overriding the thread' });
        bodyFile = Option.String('--body-file', { description: 'The Markdown body file, `-` for stdin' });
        html = Option.Boolean('--html', false, { description: 'The body is HTML, not Markdown' });
        signature = Option.Boolean('--signature', true, { description: 'Append the Gmail signature' });
        quote = Option.Boolean('--quote', true, { description: "Quote the thread's last message" });
        attach = Option.Array('--attach', [], { description: 'A file to attach; repeatable' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const bodyFile = this.bodyFile ?? (isTerminal(this.context.stdin) ? undefined : '-');
            if (!bodyFile) {
                throw new UsageError('Pass the body with --body-file <path>, or pipe it on stdin.');
            }

            const body = await readDraftBody({ bodyFile, stdin: this.context.stdin, access: draftFileAccess(files) });
            if (!body.trim()) {
                throw new UsageError('The draft body is empty.');
            }

            const client = await this.container.resolve(GmailClientFactory)({
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const { gmail, call } = client;
            const reply = this.thread ? await readReplyContext(client, this.thread) : null;

            const to = this.to || reply?.to;
            if (!to) {
                throw new UsageError('Pass --to, or --thread to reply in a thread.');
            }

            const subject = this.subject ?? reply?.subject ?? '';
            const inReplyTo = this.inReplyTo || reply?.inReplyTo;
            const references = reply ? buildReferences(reply.references, inReplyTo ?? '') : inReplyTo;
            const { html, text, images } = buildDraftBody({
                body,
                bodyFormat: this.html ? 'html' : 'markdown',
                signatureHtml: this.signature ? await readSignature(client, this.context.stderr) : null,
                quote: this.quote && reply ? reply.quote : null,
                attribution,
            });

            // Every file is read before the draft is written: a bad path means no draft at all.
            const access = draftFileAccess(files);
            const inline = await Promise.all(
                images.map(async image => ({ ...(await loadLocalFile(image.path, access)), cid: image.cid })),
            );
            const attached = await Promise.all(this.attach.map(file => loadLocalFile(file, access)));
            assertTotalSize([...inline, ...attached]);

            const message = await buildMime({
                to,
                cc: this.cc,
                bcc: this.bcc,
                subject,
                html,
                text,
                inReplyTo,
                references,
                attachments: [...inline, ...attached],
            });
            const draft = await gmail.users.drafts.create(
                { userId: 'me', requestBody: { message: { threadId: this.thread } }, media: draftMedia(message) },
                call,
            );

            this.context.stdout.write(
                `Draft created: ${draft.data.id} (message ${draft.data.message?.id}, thread ${draft.data.message?.threadId}) ` +
                    `to ${to}, subject "${subject}"${formatDraftFiles(inline, attached)}\n`,
            );
        }
    };
}

function isTerminal(stream: Readable) {
    return 'isTTY' in stream && stream.isTTY === true;
}
