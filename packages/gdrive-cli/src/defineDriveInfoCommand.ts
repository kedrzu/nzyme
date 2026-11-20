import type { drive_v3 } from '@googleapis/drive';

import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';

import type { DriveClient } from './createDriveClient.js';
import { createDriveClient } from './createDriveClient.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';
import { fileIdFrom, NATIVE, typeLabel } from './formats.js';
import { FILE_FIELDS, getDriveFile } from './getDriveFile.js';

const INFO_FIELDS =
    `${FILE_FIELDS}, description, createdTime, owners(displayName, emailAddress), ` +
    'lastModifyingUser(displayName, emailAddress), shared, version, ' +
    'capabilities(canEdit, canTrash, canDownload, canAddChildren)';

/** Parent folders followed at most when building a path. */
const MAX_PATH_DEPTH = 25;

/**
 * Defines `<prefix> info <file>`: a file's or folder's metadata as a `key: value` block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveInfoCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveInfoCommand extends Command {
        static override paths = [[...prefix.split(' '), 'info']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: "Show a file's metadata",
            details: `
                Prints a file's or folder's type, size, path, owners, dates, link, description, whether
                it is starred or trashed, what the account may do with it, and the formats a Google
                file exports to. The file is an id or a drive.google.com / docs.google.com URL.
            `,
            examples: [['A Doc by its URL', `${prefix} info https://docs.google.com/document/d/1AbC_d-EfGh/edit`]],
        });

        file = Option.String({ name: 'file' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const fileId = fileIdFrom(this.file);
            const client = await createDriveClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const file = await getDriveFile({ client, fileId, fields: INFO_FIELDS });
            const capabilities = Object.entries(file.capabilities ?? {})
                .filter(([, allowed]) => allowed)
                .map(([name]) => name.replace(/^can/, '').toLowerCase());
            const shortcut = file.shortcutDetails;

            this.context.stdout.write(
                formatHeaderBlock([
                    ['id', file.id ?? ''],
                    ['name', file.name ?? ''],
                    ['type', typeLabel(file.mimeType)],
                    ['mimeType', file.mimeType ?? ''],
                    ['size', file.size ?? ''],
                    ['path', (await pathOf(client, file)) ?? ''],
                    ['modified', file.modifiedTime ?? ''],
                    ['created', file.createdTime ?? ''],
                    ['owners', (file.owners ?? []).map(owner => owner.emailAddress ?? owner.displayName).join(', ')],
                    [
                        'lastModifiedBy',
                        file.lastModifyingUser?.emailAddress ?? file.lastModifyingUser?.displayName ?? '',
                    ],
                    ['sharedDrive', file.driveId ?? ''],
                    ['shared', file.shared ? 'yes' : ''],
                    ['starred', file.starred ? 'yes' : ''],
                    ['trashed', file.trashed ? 'yes' : ''],
                    ['version', file.version ?? ''],
                    ['link', file.webViewLink ?? ''],
                    [
                        'shortcutTo',
                        shortcut?.targetId ? `${shortcut.targetId} (${typeLabel(shortcut.targetMimeType)})` : '',
                    ],
                    ['capabilities', capabilities.join(', ')],
                    ['exportFormats', (file.mimeType && NATIVE[file.mimeType]?.download.join(', ')) || ''],
                    ['description', file.description ?? ''],
                ]),
            );
        }
    };
}

/** A `My Drive/Projects/2026` style path along the file's first parents. */
async function pathOf({ drive, call }: DriveClient, file: drive_v3.Schema$File): Promise<string | undefined> {
    const names: string[] = [];
    let parent = file.parents?.[0];
    for (let hop = 0; parent && hop < MAX_PATH_DEPTH; hop++) {
        if (file.driveId && parent === file.driveId) {
            const shared = await drive.drives.get({ driveId: parent, fields: 'name' }, call).catch(() => null);
            names.unshift(shared?.data.name ?? 'Shared drive');
            return names.join('/');
        }

        const folder = await drive.files
            .get({ fileId: parent, fields: 'name, parents', supportsAllDrives: true }, call)
            .catch(() => null);
        if (!folder) {
            names.unshift('…');
            return names.join('/');
        }

        names.unshift(folder.data.name ?? '?');
        parent = folder.data.parents?.[0];
    }

    return names.length > 0 ? names.join('/') : undefined;
}
