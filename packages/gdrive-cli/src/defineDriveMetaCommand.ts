import type { drive_v3 } from '@googleapis/drive';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { createDriveClient } from './createDriveClient.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { formatDriveFile } from './formatDriveFile.js';
import { fileIdFrom } from './formats.js';
import { FILE_FIELDS, getDriveFile } from './getDriveFile.js';

/**
 * Defines `<prefix> meta <file> [--name] [--description] [--star|--unstar] [--move-to]`: renames,
 * describes, stars or moves a file in one update.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveMetaCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveMetaCommand extends Command {
        static override paths = [[...prefix.split(' '), 'meta']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'Rename, move, describe or star a file',
            details: `
                Changes only what is passed. \`--move-to\` moves the file into a folder or shared drive
                (id or URL), out of every folder it is in now. \`--description ""\` clears the
                description. Prints the file's id, name and type.
            `,
            examples: [
                ['Rename and star', `${prefix} meta 1AbC_d-EfGh --name "Budget 2026" --star`],
                ['Move', `${prefix} meta 1AbC_d-EfGh --move-to 1XyZ_folder`],
            ],
        });

        file = Option.String({ name: 'file' });
        name = Option.String('--name', { description: 'The new name' });
        description = Option.String('--description', { description: 'The new description; "" clears it' });
        star = Option.Boolean('--star', false, { description: 'Star the file' });
        unstar = Option.Boolean('--unstar', false, { description: 'Unstar the file' });
        moveTo = Option.String('--move-to', { description: 'The folder or shared drive to move the file into' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.file);
            const addParents = this.moveTo ? fileIdFrom(this.moveTo, '--move-to') : undefined;
            if (this.star && this.unstar) {
                throw new UsageError('Pass --star or --unstar, not both.');
            }

            const requestBody: drive_v3.Schema$File = {};
            if (this.name) {
                requestBody.name = this.name;
            }

            if (this.description !== undefined) {
                requestBody.description = this.description;
            }

            if (this.star || this.unstar) {
                requestBody.starred = this.star;
            }

            if (Object.keys(requestBody).length === 0 && !addParents) {
                throw new UsageError('Nothing to change: pass --name, --description, --star, --unstar or --move-to.');
            }

            const client = await createDriveClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            let removeParents: string | undefined;
            if (addParents) {
                const current = await getDriveFile({ client, fileId, fields: 'parents' });
                removeParents = (current.parents ?? []).filter(parent => parent !== addParents).join(',') || undefined;
            }

            const updated = await client.drive.files.update(
                { fileId, requestBody, addParents, removeParents, fields: FILE_FIELDS, supportsAllDrives: true },
                client.call,
            );

            this.context.stdout.write(`Updated ${formatDriveFile(updated.data)}\n`);
        }
    };
}
