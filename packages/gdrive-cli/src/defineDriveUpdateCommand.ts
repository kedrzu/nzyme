import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { formatDriveFile } from './formatDriveFile.js';
import { DOCUMENT, fileIdFrom, FOLDER, importTargetOf, isNative, SPREADSHEET, typeLabel } from './formats.js';
import { FILE_FIELDS, getDriveFile } from './getDriveFile.js';
import { driveFileAccess } from './localFiles.js';
import { readUploadContent } from './readUploadContent.js';

/**
 * Defines `<prefix> update <file> [--file] [--content-type]`: replaces a file's contents from an
 * allowed local file or stdin, keeping its id, link, sharing and history.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveUpdateCommand(params: DriveCommandParams): CommandClass {
    const { prefix, files } = params;

    return class DriveUpdateCommand extends Command {
        static override paths = [[...prefix.split(' '), 'update']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: "Replace a file's contents",
            details: `
                The new contents come from \`--file <path>\` or stdin; the file keeps its id, link,
                sharing and version history. A Google Doc takes Markdown, text, HTML or docx; a Sheet
                takes CSV or xlsx; Slides take pptx. Stdin is typed by \`--content-type\`, by default
                text/markdown for a Doc, text/csv for a Sheet and the file's own type otherwise. A
                shortcut updates its target.

                The local file must lie in the project directory, a configured root or the downloads
                directory; .env files, OAuth credentials and tokens are refused. Prints the file's id
                and new version.
            `,
            examples: [['A Doc from Markdown', `${prefix} update 1AbC_d-EfGh < notes.md`]],
        });

        target = Option.String({ name: 'file' });
        file = Option.String('--file', { description: 'The local file with the new contents; stdin when unset' });
        contentType = Option.String('--content-type', { description: 'The MIME type of the contents on stdin' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.target);
            const client = await this.container.resolve(DriveClientFactory)({
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const file = await getDriveFile({ client, fileId, followShortcut: true });
            const id = file.id;
            const mimeType = file.mimeType ?? '';
            assert(id, `Drive returned ${fileId} without its id`);
            if (mimeType === FOLDER) {
                throw new UsageError(`'${file.name}' is a folder - it has no contents to replace.`);
            }

            const native = isNative(mimeType);
            const stdinType = this.contentType ?? defaultContentType(mimeType);
            if (this.file === undefined && !stdinType) {
                throw new UsageError(`A ${typeLabel(mimeType)} takes no text: pass --file or --content-type.`);
            }

            const content = await readUploadContent({
                file: this.file,
                stdin: this.context.stdin,
                access: driveFileAccess(files),
                stdinType: stdinType ?? '',
            });
            if (native && importTargetOf(content.mimeType) !== mimeType) {
                throw new UsageError(`A ${typeLabel(mimeType)} cannot take ${content.mimeType} contents.`);
            }

            const updated = await client.drive.files.update(
                {
                    fileId: id,
                    media: { mimeType: content.mimeType, body: content.body() },
                    fields: `${FILE_FIELDS}, version`,
                    supportsAllDrives: true,
                },
                client.call,
            );

            this.context.stdout.write(
                `Replaced the contents of ${formatDriveFile(updated.data)}, now version ${updated.data.version}\n`,
            );
        }
    };
}

/** What stdin is taken as: Markdown for a Doc, CSV for a Sheet, a regular file's own type. */
function defaultContentType(mimeType: string) {
    switch (mimeType) {
        case DOCUMENT:
            return 'text/markdown';
        case SPREADSHEET:
            return 'text/csv';
        default:
            return isNative(mimeType) ? undefined : mimeType || 'text/plain';
    }
}
