import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { formatDriveFile } from './formatDriveFile.js';
import { fileIdFrom } from './formats.js';
import { FILE_FIELDS } from './getDriveFile.js';

/**
 * Defines `<prefix> trash <file>` (`trashed`) or `<prefix> restore <file>`: moves a file into the
 * trash or out of it with one metadata update. Nothing is ever deleted permanently.
 * @param trashed Whether the command trashes (`trash`) or restores (`restore`).
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveTrashCommand(params: DriveCommandParams, trashed: boolean): CommandClass {
    const { prefix } = params;
    const name = trashed ? 'trash' : 'restore';

    return class DriveTrashCommand extends Command {
        static override paths = [[...prefix.split(' '), name]];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: trashed ? 'Move a file to the trash' : 'Take a file out of the trash',
            details: trashed
                ? `
                    Moves a file or folder, with everything in it, to the Drive trash. Drive keeps it
                    there for 30 days, restorable with \`${prefix} restore\`; nothing is ever deleted
                    permanently.
                `
                : 'Restores a trashed file or folder to where it was.',
        });

        file = Option.String({ name: 'file' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.file);
            const { drive, call } = await this.container.resolve(DriveClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const updated = await drive.files.update(
                { fileId, requestBody: { trashed }, fields: FILE_FIELDS, supportsAllDrives: true },
                call,
            );

            this.context.stdout.write(
                trashed
                    ? `Moved to the trash: ${formatDriveFile(updated.data)}; \`${this.cli.binaryName} ${prefix} restore ${fileId}\` brings it back\n`
                    : `Restored from the trash: ${formatDriveFile(updated.data)}\n`,
            );
        }
    };
}
