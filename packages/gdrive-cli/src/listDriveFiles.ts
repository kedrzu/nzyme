import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import type { DriveClient } from './createDriveClient.js';
import { typeLabel } from './formats.js';
import { FILE_FIELDS } from './getDriveFile.js';

/** Options of {@link listDriveFiles}. */
export interface ListDriveFilesOptions {
    /** The Drive query. */
    q: string;
    pageSize: number;
    pageToken?: string;
    orderBy?: string;
}

/**
 * Lists the files matching a query across every drive the account can reach, as output: one
 * tab-separated line per file (id, type, modified, name), then `nextPageToken: …` when there are more.
 */
export async function listDriveFiles({ drive, call }: DriveClient, options: ListDriveFilesOptions): Promise<string> {
    const response = await drive.files.list(
        {
            ...options,
            fields: `nextPageToken, incompleteSearch, files(${FILE_FIELDS})`,
            corpora: 'allDrives',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        },
        call,
    );

    const { files, nextPageToken, incompleteSearch } = response.data;
    let output = (files ?? [])
        .map(file => formatTsvLine([file.id ?? '', typeLabel(file.mimeType), file.modifiedTime ?? '', file.name ?? '']))
        .join('');
    if (nextPageToken) {
        output += `nextPageToken: ${nextPageToken}\n`;
    }

    if (incompleteSearch) {
        output += 'incompleteSearch: true - Drive did not search every drive; narrow the query\n';
    }

    return output;
}
