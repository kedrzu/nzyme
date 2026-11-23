import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';
import type { GoogleCommandParams } from '@nzyme/google-auth/GoogleCommandParams.js';

import { createDriveClient } from './createDriveClient.js';
import { fileIdFrom, mimeTypeFrom, searchQuery } from './formats.js';
import { listDriveFiles } from './listDriveFiles.js';

/**
 * Defines `<prefix> search [query] [--folder] [--type] [--limit] [--page-token]`: one tab-separated
 * line per file across My Drive, shared with me and shared drives, trashed files left out.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDriveSearchCommand(params: GoogleCommandParams): CommandClass {
    const { prefix } = params;

    return class DriveSearchCommand extends Command {
        static override paths = [[...prefix.split(' '), 'search']];
        static override usage = Command.Usage({
            category: 'Google Drive',
            description: 'Search files in My Drive, shared with me and shared drives',
            details: `
                The query is plain words (a full-text search of names and contents) or Drive query
                syntax, e.g. \`name contains 'invoice' and modifiedTime > '2026-01-01'\`. Trashed files
                are left out. Prints one tab-separated line per file: id, type, modified time and name,
                then \`nextPageToken: …\` when there are more; pass it as \`--page-token\`.
            `,
            examples: [
                ['Full-text search', `${prefix} search "faktura maj"`],
                ['Sheets in a folder', `${prefix} search --folder 1AbC_d-EfGh --type sheet`],
            ],
        });

        query = Option.String({ required: false, name: 'query' });
        folder = Option.String('--folder', { description: 'Only direct children of this folder (id or URL)' });
        type = Option.String('--type', {
            description: 'Only this type: a MIME type, or folder, doc, sheet, slides, drawing, pdf',
        });
        limit = Option.String('--limit', '20', { description: 'The most files to list, at most 100' });
        pageToken = Option.String('--page-token', { description: 'The nextPageToken of a previous search' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const pageSize = parseCount({ value: this.limit, option: '--limit', max: 100 });
            if (!this.query && !this.folder && !this.type) {
                throw new UsageError('Pass a query, --folder or --type.');
            }

            const q = searchQuery({
                query: this.query,
                folderId: this.folder && fileIdFrom(this.folder, '--folder'),
                mimeType: this.type && mimeTypeFrom(this.type),
            });
            const client = await createDriveClient({
                auth: this.container.resolve(params.auth),
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            // Drive refuses an order together with a full-text search.
            const orderBy = q.includes('fullText contains') ? undefined : 'modifiedTime desc';

            this.context.stdout.write(
                await listDriveFiles(client, { q, pageSize, pageToken: this.pageToken, orderBy }),
            );
        }
    };
}
