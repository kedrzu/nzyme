import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { DriveClientFactory } from './DriveClientFactory.js';
import type { DriveCommandParams } from './DriveCommandsOptions.js';

/** Shared drives listed at most; past this the list says it stopped. */
const MAX_DRIVES = 1000;

/**
 * Defines `<prefix> drives`: the shared drives the account belongs to, `id  name`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveDrivesCommand(params: DriveCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveDrivesCommand extends Command {
        static override paths = [[...prefix.split(' '), 'drives']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'List the shared drives',
            details: `
                Prints one tab-separated line per shared drive the account belongs to: id and name. A
                drive's id works as the folder of \`${prefix} ls\` and \`${prefix} search --folder\`.
            `,
        });

        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const { drive, call } = await this.container.resolve(DriveClientFactory)({
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });

            let listed = 0;
            let pageToken: string | undefined;
            do {
                const response = await drive.drives.list(
                    { pageSize: 100, pageToken, fields: 'nextPageToken, drives(id, name)' },
                    call,
                );
                for (const shared of response.data.drives ?? []) {
                    this.context.stdout.write(formatTsvLine([shared.id ?? '', shared.name ?? '']));
                    listed++;
                }

                pageToken = response.data.nextPageToken ?? undefined;
            } while (pageToken && listed < MAX_DRIVES);

            if (pageToken) {
                this.context.stdout.write(`Stopped after ${listed} shared drives.\n`);
            }
        }
    };
}
