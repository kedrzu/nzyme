import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

import { createDriveClient } from './createDriveClient.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { fileIdFrom, quote } from './formats.js';
import { listDriveFiles } from './listDriveFiles.js';

/**
 * Defines `<prefix> ls [folder] [--limit] [--page-token]`: a folder's direct children, folders first,
 * one tab-separated line each.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveLsCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveLsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'ls']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: "List a folder's contents",
            details: `
                Lists the direct children of a folder, folders first, then by name; without a folder the
                root of My Drive, and a shared drive's id lists that drive's root. Prints one
                tab-separated line per file: id, type, modified time and name, then
                \`nextPageToken: …\` when there are more.
            `,
            examples: [['A folder by its URL', `${prefix} ls https://drive.google.com/drive/folders/1AbC_d-EfGh`]],
        });

        folder = Option.String({ required: false, name: 'folder' });
        limit = Option.String('--limit', '100', { description: 'The most entries to list, at most 1000' });
        pageToken = Option.String('--page-token', { description: 'The nextPageToken of a previous listing' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const pageSize = parseCount({ value: this.limit, option: '--limit', max: 1000 });
            const folder = this.folder ? fileIdFrom(this.folder, 'folder') : 'root';
            const client = await createDriveClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });

            this.context.stdout.write(
                await listDriveFiles(client, {
                    q: `${quote(folder)} in parents and trashed = false`,
                    pageSize,
                    pageToken: this.pageToken,
                    orderBy: 'folder, name',
                }),
            );
        }
    };
}
