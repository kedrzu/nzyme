import * as fs from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

/** Arguments of {@link readDraftBody}. */
export interface ReadDraftBodyParams {
    /** The `--body-file` value: a path, or `-` for stdin. */
    bodyFile: string;
    stdin: Readable;
}

/**
 * Reads a draft body from `--body-file`: a path, or `-` for stdin. A body never comes from an
 * argument, so a long Markdown text needs no shell quoting.
 */
export async function readDraftBody(params: ReadDraftBodyParams): Promise<string> {
    const { bodyFile, stdin } = params;
    return bodyFile === '-' ? await text(stdin) : await fs.readFile(bodyFile, 'utf8');
}
