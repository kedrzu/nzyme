import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';
import { assert } from '@nzyme/utils/assert.js';

import { createDriveClient } from './createDriveClient.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { fileIdFrom, FOLDER, isNative, isTextMime, textExport, typeLabel } from './formats.js';
import { getDriveFile } from './getDriveFile.js';

/** Drive caps exports at about 10 MB; a regular text file over this is a download, not a read. */
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

/**
 * Defines `<prefix> read <file> [--max-chars]`: a file's contents as text under a short header block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveReadCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveReadCommand extends Command {
        static override paths = [[...prefix.split(' '), 'read']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: "Print a file's contents as text",
            details: `
                A Google Doc reads as Markdown, a Sheet as CSV (its first sheet only), Slides as plain
                text and Apps Script as JSON; text-like files (txt, md, csv, json, xml, code) as they
                are. Binary files (PDF, images, Office) and Drawings are refused: save them with
                \`${prefix} download\`. A shortcut reads its target. Prints a header block (id, name,
                type, modified, chars, and whether the text was cut), a blank line, then the text.
            `,
            examples: [['A Doc as Markdown', `${prefix} read https://docs.google.com/document/d/1AbC_d-EfGh/edit`]],
        });

        file = Option.String({ name: 'file' });
        maxChars = Option.String('--max-chars', '100000', { description: 'Cut the text after this many characters' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.file);
            const max = parseCount({ value: this.maxChars, option: '--max-chars' });
            const client = await createDriveClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const { drive, call } = client;
            const file = await getDriveFile({ client, fileId, followShortcut: true });
            const id = file.id;
            const mimeType = file.mimeType ?? '';
            assert(id, `Drive returned ${fileId} without its id`);
            if (mimeType === FOLDER) {
                throw new UsageError(
                    `'${file.name}' is a folder - list it with \`${this.cli.binaryName} ${prefix} ls ${id}\`.`,
                );
            }

            let body: Readable;
            let note: string | undefined;
            if (isNative(mimeType)) {
                const exported = textExport(mimeType);
                if (!exported) {
                    throw new UsageError(
                        `A ${typeLabel(mimeType)} has no text form - use \`${this.cli.binaryName} ${prefix} download\`.`,
                    );
                }

                const response = await drive.files.export(
                    { fileId: id, mimeType: exported.mimeType },
                    { ...call, responseType: 'stream' },
                );
                body = response.data;
                note = exported.note;
            } else {
                if (!isTextMime(mimeType)) {
                    throw new UsageError(
                        `'${file.name}' is ${mimeType}, not text - save it with \`${this.cli.binaryName} ${prefix} download ${id}\`.`,
                    );
                }

                if (Number(file.size ?? 0) > MAX_TEXT_BYTES) {
                    throw new UsageError(
                        `'${file.name}' is over 10 MB - use \`${this.cli.binaryName} ${prefix} download ${id}\`.`,
                    );
                }

                const response = await drive.files.get(
                    { fileId: id, alt: 'media', supportsAllDrives: true },
                    { ...call, responseType: 'stream' },
                );
                body = response.data;
            }

            const text = (await buffer(body)).toString('utf8');
            const truncated = text.length > max;
            const shown = truncated ? text.slice(0, max) : text;
            this.context.stdout.write(
                formatHeaderBlock([
                    ['id', id],
                    ['name', file.name ?? ''],
                    ['type', typeLabel(mimeType)],
                    ['modified', file.modifiedTime ?? ''],
                    ['chars', String(text.length)],
                    ['truncated', truncated ? `yes, after ${max} characters` : ''],
                    ['note', note ?? ''],
                ]) +
                    '\n' +
                    shown +
                    (shown.endsWith('\n') ? '' : '\n'),
            );
        }
    };
}
