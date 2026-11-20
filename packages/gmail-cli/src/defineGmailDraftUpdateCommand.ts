import type { gmail_v1 } from '@googleapis/gmail';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import type { RawAttachment } from './compose.js';
import { buildDraftBody, buildMime } from './compose.js';
import { draftMedia } from './draftMedia.js';
import { formatDraftFiles } from './formatDraftFiles.js';
import type { GmailClient } from './GmailClientFactory.js';
import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { extractRawBody, getHeader, inlineCid } from './gmailContent.js';
import { assertTotalSize, draftFileAccess, loadLocalFile } from './localFiles.js';
import { readDraftBody } from './readDraftBody.js';
import { readReplyContext } from './readReplyContext.js';
import { readSignature } from './readSignature.js';

/**
 * Defines `<prefix> draft update <id>`: rewrites a draft, keeping every field and attachment the call
 * does not change. A new body is re-rendered with the signature and the quote of the thread's latest
 * message.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailDraftUpdateCommand(params: GmailCommandParams): CommandClass {
    const { prefix, files, reply: attribution } = params;

    return class GmailDraftUpdateCommand extends Command {
        static override paths = [[...prefix.split(' '), 'draft', 'update']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Change a draft; never sends',
            details: `
                Fields left out keep their current values; \`--subject ""\` clears the subject. A new
                body comes from \`--body-file <path>\` or \`--body-file -\` (stdin), as Markdown or
                with \`--html\` as HTML, and gets the signature and the quote of the thread's latest
                message again (\`--no-signature\`, \`--no-quote\`). Without a new body the current one
                stays as it is.

                Existing attachments stay; \`--remove-attachment <filename>\` drops one, \`--attach\`
                adds one. Inline images of the old body stay while the new body still refers to them.
                Read the current draft with \`${prefix} draft get <id>\`.
            `,
            examples: [
                ['Replace the body', `${prefix} draft update r-123 --body-file body.md`],
                ['Swap an attachment', `${prefix} draft update r-123 --remove-attachment old.pdf --attach new.pdf`],
            ],
        });

        id = Option.String({ name: 'id' });
        to = Option.String('--to', { description: 'Recipients, comma-separated' });
        cc = Option.String('--cc', { description: 'Cc recipients, comma-separated' });
        bcc = Option.String('--bcc', { description: 'Bcc recipients, comma-separated' });
        subject = Option.String('--subject', { description: 'The subject; "" clears it' });
        bodyFile = Option.String('--body-file', { description: 'A new Markdown body file, `-` for stdin' });
        html = Option.Boolean('--html', false, { description: 'The new body is HTML, not Markdown' });
        signature = Option.Boolean('--signature', true, { description: 'Append the Gmail signature to a new body' });
        quote = Option.Boolean('--quote', true, { description: "Quote the thread's latest message under a new body" });
        attach = Option.Array('--attach', [], { description: 'A file to attach; repeatable' });
        removeAttachment = Option.Array('--remove-attachment', [], {
            description: 'The file name of an attachment to drop; repeatable',
        });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const body =
                this.bodyFile === undefined
                    ? undefined
                    : await readDraftBody(this.bodyFile, this.context.stdin, draftFileAccess(files));
            const client = await this.container.resolve(GmailClientFactory)(params, this.cli.binaryName, this.account);
            const { gmail, call } = client;

            const draft = await gmail.users.drafts.get({ userId: 'me', id: this.id, format: 'full' }, call);
            const current = draft.data.message;
            if (!current?.payload || !current.id) {
                throw new Error(`Draft ${this.id} has no message`);
            }

            const headers = current.payload.headers;
            const existing = await readDraftAttachments(client, current.id, current.payload);
            const kept = existing.filter(file => !file.cid);
            const missing = this.removeAttachment.filter(name => !kept.some(file => file.filename === name));
            if (missing.length > 0) {
                const names = kept.map(file => file.filename).join(', ') || 'none';
                throw new UsageError(
                    `No attachment named ${missing.map(name => `'${name}'`).join(', ')} (the draft has: ${names}).`,
                );
            }

            const access = draftFileAccess(files);
            const attached = [
                ...kept.filter(file => !this.removeAttachment.includes(file.filename)),
                ...(await Promise.all(this.attach.map(file => loadLocalFile(file, access)))),
            ];

            let inReplyTo = getHeader(headers, 'In-Reply-To');
            let references = getHeader(headers, 'References');
            let html: string | undefined;
            let text: string | undefined;
            let inline: RawAttachment[];
            if (body === undefined) {
                const currentBody = extractRawBody(current.payload);
                html = currentBody.html ?? undefined;
                text = currentBody.text ?? undefined;
                inline = existing.filter(file => file.cid);
            } else {
                // A new body: re-render it with the signature and the quote of the latest message.
                const reply = current.threadId ? await readReplyContext(client, current.threadId) : null;
                if (reply) {
                    inReplyTo = reply.inReplyTo;
                    references = reply.references;
                }

                const rendered = buildDraftBody({
                    body,
                    bodyFormat: this.html ? 'html' : 'markdown',
                    signatureHtml: this.signature ? await readSignature(client, this.context.stderr) : null,
                    quote: this.quote && reply ? reply.quote : null,
                    attribution,
                });
                ({ html, text } = rendered);
                // Old inline images survive only while the new body still points at their cid.
                const keptImages = existing.filter(file => file.cid && rendered.html.includes(`cid:${file.cid}`));
                const freshImages = rendered.images.filter(image => !keptImages.some(file => file.cid === image.cid));
                inline = [
                    ...keptImages,
                    ...(await Promise.all(
                        freshImages.map(async image => ({
                            ...(await loadLocalFile(image.path, access)),
                            cid: image.cid,
                        })),
                    )),
                ];
            }

            assertTotalSize([...inline, ...attached]);

            const message = await buildMime({
                from: getHeader(headers, 'From'),
                to: this.to ?? getHeader(headers, 'To'),
                cc: this.cc ?? getHeader(headers, 'Cc'),
                bcc: this.bcc ?? getHeader(headers, 'Bcc'),
                subject: this.subject ?? getHeader(headers, 'Subject'),
                html,
                text,
                inReplyTo,
                references,
                attachments: [...inline, ...attached],
            });
            const updated = await gmail.users.drafts.update(
                {
                    userId: 'me',
                    id: this.id,
                    requestBody: { id: this.id, message: { threadId: current.threadId } },
                    media: draftMedia(message),
                },
                call,
            );

            const changes: [string, boolean][] = [
                ['to', this.to !== undefined],
                ['cc', this.cc !== undefined],
                ['bcc', this.bcc !== undefined],
                ['subject', this.subject !== undefined],
                ['body', body !== undefined],
                ['attachments', this.attach.length > 0 || this.removeAttachment.length > 0],
            ];
            const changed = changes.filter(([, isChanged]) => isChanged).map(([name]) => name);
            this.context.stdout.write(
                `Draft updated: ${updated.data.id} (message ${updated.data.message?.id}, thread ${updated.data.message?.threadId}), ` +
                    `changed: ${changed.join(', ') || 'nothing'}${formatDraftFiles(inline, attached)}\n`,
            );
        }
    };
}

/** A part holding a file, with the id its bytes are fetched by. */
interface FilePart {
    part: gmail_v1.Schema$MessagePart;
    attachmentId: string;
}

/** The draft's attachments re-read as bytes, so rewriting the draft doesn't drop them. */
async function readDraftAttachments(
    { gmail, call }: GmailClient,
    messageId: string,
    payload: gmail_v1.Schema$MessagePart,
): Promise<RawAttachment[]> {
    const { html } = extractRawBody(payload);

    return await Promise.all(
        fileParts(payload).map(async ({ part, attachmentId }) => {
            const attachment = await gmail.users.messages.attachments.get(
                { userId: 'me', messageId, id: attachmentId },
                call,
            );
            return {
                filename: part.filename ?? '',
                contentType: part.mimeType || 'application/octet-stream',
                content: Buffer.from(attachment.data.data ?? '', 'base64url'),
                cid: inlineCid(part, html) ?? undefined,
            };
        }),
    );
}

function fileParts(part: gmail_v1.Schema$MessagePart): FilePart[] {
    const attachmentId = part.body?.attachmentId;
    const own = part.filename && attachmentId ? [{ part, attachmentId }] : [];
    return [...own, ...(part.parts ?? []).flatMap(fileParts)];
}
