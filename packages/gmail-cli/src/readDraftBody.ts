import * as fs from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';
import { resolveReadableFile } from '@nzyme/node-utils/resolveReadableFile.js';

/**
 * Reads a draft body from `--body-file`: a path, or `-` for stdin. A body never comes from an
 * argument, so a long Markdown text needs no shell quoting. A path passes the same checks as an
 * attachment, so a secrets file cannot be copied into a draft as its body.
 */
export async function readDraftBody(bodyFile: string, stdin: Readable, access: FileAccess): Promise<string> {
    return bodyFile === '-'
        ? await text(stdin)
        : await fs.readFile(await resolveReadableFile(bodyFile, access), 'utf8');
}
