import * as fs from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';
import { resolveReadableFile } from '@nzyme/node-utils/resolveReadableFile.js';

/** Arguments of {@link readDraftBody}. */
export interface ReadDraftBodyParams {
    /** The `--body-file` value: a path, or `-` for stdin. */
    bodyFile: string;
    stdin: Readable;
    /** The checks a path must pass, the same as for an attachment. */
    access: FileAccess;
}

/**
 * Reads a draft body from `--body-file`: a path, or `-` for stdin. A body never comes from an
 * argument, so a long Markdown text needs no shell quoting. A path passes the same checks as an
 * attachment, so a secrets file cannot be copied into a draft as its body.
 */
export async function readDraftBody(params: ReadDraftBodyParams): Promise<string> {
    const { bodyFile, stdin, access } = params;
    return bodyFile === '-'
        ? await text(stdin)
        : await fs.readFile(await resolveReadableFile(bodyFile, access), 'utf8');
}
