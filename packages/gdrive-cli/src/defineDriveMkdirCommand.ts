import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { formatDriveFile } from './formatDriveFile.js';
import { fileIdFrom, FOLDER } from './formats.js';
import { FILE_FIELDS } from './getDriveFile.js';

/**
 * Defines `<prefix> mkdir <name> [--parent]`: creates a folder and prints its id.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveMkdirCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveMkdirCommand extends Command {
        static override paths = [[...prefix.split(' '), 'mkdir']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'Create a folder',
            details: `
                Creates a folder in My Drive's root, or in \`--parent\` (a folder or shared drive, by id
                or URL). Prints the new folder's id and name.
            `,
            examples: [['A folder in a folder', `${prefix} mkdir "Invoices 2026" --parent 1AbC_d-EfGh`]],
        });

        name = Option.String({ name: 'name' });
        parent = Option.String('--parent', {
            description: 'The parent folder or shared drive (id or URL); default My Drive root',
        });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const parent = this.parent ? fileIdFrom(this.parent, '--parent') : undefined;
            const { drive, call } = await this.container.resolve(DriveClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const created = await drive.files.create(
                {
                    requestBody: { name: this.name, mimeType: FOLDER, parents: parent ? [parent] : undefined },
                    fields: FILE_FIELDS,
                    supportsAllDrives: true,
                },
                call,
            );

            this.context.stdout.write(`Created folder ${formatDriveFile(created.data)}\n`);
        }
    };
}
