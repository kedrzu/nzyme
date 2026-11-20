import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { formatDriveFile } from './formatDriveFile.js';
import { fileIdFrom, importTarget, quote } from './formats.js';
import { FILE_FIELDS } from './getDriveFile.js';
import { driveFileAccess, mimeTypeOf } from './localFiles.js';
import { readUploadContent } from './readUploadContent.js';

/**
 * Defines `<prefix> upload [--file] [--name] [--folder] [--convert] [--description]`: creates a new
 * file from an allowed local file or stdin, optionally converted to a Google file.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveUploadCommand(params: DriveCommandParams): CommandClass {
    const { prefix, files } = params;

    return class DriveUploadCommand extends Command {
        static override paths = [[...prefix.split(' '), 'upload']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'Create a file in Drive from a local file or stdin',
            details: `
                The contents come from \`--file <path>\` or stdin (then \`--name\` is required; a name
                without an extension uploads as plain text). With \`--convert\` the file becomes a
                Google file: .md/.txt/.html/.docx a Doc, .csv/.xlsx a Sheet, .pptx Slides, and the
                extension is dropped from the name. Drive allows duplicate names: to change an existing
                file use \`${prefix} update\`.

                The local file must lie in the project directory, a configured root or the downloads
                directory; .env files, OAuth credentials and tokens are refused. Prints the new file's
                id, name and type.
            `,
            examples: [
                ['A PDF into a folder', `${prefix} upload --file report.pdf --folder 1AbC_d-EfGh`],
                ['Markdown as a Doc', `${prefix} upload --name "Notes.md" --convert < notes.md`],
            ],
        });

        file = Option.String('--file', { description: 'The local file to upload; stdin when unset' });
        name = Option.String('--name', { description: 'The name in Drive; default the local file name' });
        folder = Option.String('--folder', {
            description: 'The parent folder or shared drive (id or URL); default My Drive root',
        });
        convert = Option.Boolean('--convert', false, { description: 'Convert to a Google Doc, Sheet or Slides' });
        description = Option.String('--description', { description: 'The file description' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            if (this.file === undefined && !this.name) {
                throw new UsageError('Pass --name with contents on stdin.');
            }

            const folder = this.folder ? fileIdFrom(this.folder, '--folder') : undefined;
            const hasExtension = /\.[A-Za-z0-9]+$/.test(this.name ?? '');
            const content = await readUploadContent({
                file: this.file,
                stdin: this.context.stdin,
                access: driveFileAccess(files),
                // Text without an extension is uploaded as plain text.
                stdinType: hasExtension ? mimeTypeOf(this.name ?? '') : 'text/plain',
            });

            let name = this.name || content.filename;
            if (!name) {
                throw new UsageError('Pass --name.');
            }

            const target = this.convert ? importTarget(content.mimeType) : undefined;
            if (this.convert) {
                name = name.replace(/\.[A-Za-z0-9]+$/, '') || name;
            }

            const { drive, call } = await this.container.resolve(DriveClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const created = await drive.files.create(
                {
                    requestBody: {
                        name,
                        parents: folder ? [folder] : undefined,
                        mimeType: target,
                        description: this.description,
                    },
                    media: { mimeType: content.mimeType, body: content.body() },
                    fields: FILE_FIELDS,
                    supportsAllDrives: true,
                },
                call,
            );

            this.context.stdout.write(`Uploaded ${formatDriveFile(created.data)}\n`);

            const siblings = await drive.files
                .list(
                    {
                        q: `name = ${quote(name)} and ${quote(folder ?? 'root')} in parents and trashed = false`,
                        fields: 'files(id)',
                        corpora: 'allDrives',
                        includeItemsFromAllDrives: true,
                        supportsAllDrives: true,
                    },
                    call,
                )
                .then(response => (response.data.files ?? []).filter(file => file.id !== created.data.id).length)
                .catch(() => 0);
            if (siblings > 0) {
                this.context.stdout.write(
                    `note: the folder now holds ${siblings + 1} files named '${name}' - ` +
                        `\`${this.cli.binaryName} ${prefix} update\` replaces contents instead of adding a copy\n`,
                );
            }
        }
    };
}
