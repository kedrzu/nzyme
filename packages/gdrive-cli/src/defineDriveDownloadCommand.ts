import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { downloadFormat, fileIdFrom, FOLDER, isNative } from './formats.js';
import { getDriveFile } from './getDriveFile.js';
import { downloadsDir, driveFileAccess, resolveWritablePath } from './localFiles.js';

/**
 * Defines `<prefix> download <file> [--to] [--format] [--overwrite]`: saves a file, a Google file
 * exported, under the allowed directories only, and prints the saved path.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveDownloadCommand(params: DriveCommandParams): CommandClass {
    const { prefix, files } = params;

    return class DriveDownloadCommand extends Command {
        static override paths = [[...prefix.split(' '), 'download']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'Save a file to the local disk',
            details: `
                Google files are exported: Docs to docx (or pdf, md, txt, html, odt, rtf, epub), Sheets
                to xlsx (or pdf, csv, tsv, ods), Slides to pptx (or pdf, txt, odp), Drawings to png (or
                pdf, svg, jpg); \`--format\` picks another. Other files are saved as they are. A shortcut
                saves its target.

                \`--to\` is a file, or a directory (existing, or ending in /) to save under the Drive
                name; by default the downloads directory. It must lie in the project directory, a
                configured root or the downloads directory, and is never a secrets file. An existing
                file is replaced only with \`--overwrite\`. Prints the saved path.
            `,
            examples: [
                ['A Doc as PDF', `${prefix} download 1AbC_d-EfGh --format pdf`],
                ['Into the project', `${prefix} download 1AbC_d-EfGh --to docs/`],
            ],
        });

        file = Option.String({ name: 'file' });
        to = Option.String('--to', { description: 'The target file, or a directory to save under the Drive name' });
        format = Option.String('--format', { description: 'The export format of a Google file, as an extension' });
        overwrite = Option.Boolean('--overwrite', false, { description: 'Replace an existing local file' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.file);
            const client = await this.container.resolve(DriveClientFactory)({
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
                throw new UsageError(`'${file.name}' is a folder - download its files one by one.`);
            }

            let filename = file.name ?? id;
            let exportType: string | undefined;
            if (isNative(mimeType)) {
                const format = downloadFormat(mimeType, this.format);
                exportType = format.mimeType;
                filename = `${filename}.${format.ext}`;
            } else if (this.format) {
                throw new UsageError(
                    `--format applies only to Google files; '${file.name}' is ${mimeType} and is saved as it is.`,
                );
            }

            // An allowed root counts only once it exists.
            const defaultDir = downloadsDir(files);
            await fs.mkdir(defaultDir, { recursive: true });
            const target = await resolveWritablePath({
                input: this.to ?? defaultDir + path.sep,
                defaultName: filename,
                access: driveFileAccess(files),
                overwrite: this.overwrite,
            });

            let body: Readable;
            if (exportType) {
                const response = await drive.files.export(
                    { fileId: id, mimeType: exportType },
                    { ...call, responseType: 'stream' },
                );
                body = response.data;
            } else {
                const response = await drive.files.get(
                    { fileId: id, alt: 'media', supportsAllDrives: true },
                    { ...call, responseType: 'stream' },
                );
                body = response.data;
            }

            // Written aside and renamed, so a failed download never leaves a half file under the name.
            const partial = `${target}.part-${process.pid}`;
            try {
                await pipeline(body, createWriteStream(partial, { mode: 0o644 }));
                await fs.rename(partial, target);
            } catch (error) {
                await fs.rm(partial, { force: true });
                throw error;
            }

            const { size } = await fs.stat(target);
            this.context.stdout.write(`Downloaded ${id}: ${target} (${exportType ?? mimeType}, ${size} B)\n`);
        }
    };
}
