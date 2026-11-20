import * as fs from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import type { FileAccess } from './localFiles.js';
import { resolveLocalFile } from './localFiles.js';

/**
 * Reads a draft body from `--body-file`: a path, or `-` for stdin. A body never comes from an
 * argument, so a long Markdown text needs no shell quoting. A path passes the same checks as an
 * attachment, so a secrets file cannot be copied into a draft as its body.
 */
export async function readDraftBody(bodyFile: string, stdin: Readable, access: FileAccess): Promise<string> {
    return bodyFile === '-' ? await text(stdin) : await fs.readFile(await resolveLocalFile(bodyFile, access), 'utf8');
}
