import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { UsageError } from '@nzyme/cli-core';

import type { FileAccess } from './localFiles.js';
import { localFile } from './localFiles.js';

/** Options of {@link readUploadContent}. */
export interface ReadUploadContentOptions {
    /** The local file, from `--file`; stdin when unset. */
    file: string | undefined;
    stdin: Readable;
    access: FileAccess;
    /** The type of what comes on stdin. */
    stdinType: string;
}

/** New contents for Drive, from a local file or stdin. */
export interface UploadContent {
    mimeType: string;
    /** A fresh stream of the contents. */
    body: () => Readable;
    /** The local file's name; unset for stdin. */
    filename?: string;
}

/**
 * The contents of an upload or a replacement: the local file (which must pass the file checks, so a
 * secrets file is never sent), or all of stdin. Contents never come from an argument, so a long text
 * needs no shell quoting.
 */
export async function readUploadContent(options: ReadUploadContentOptions): Promise<UploadContent> {
    const { file, stdin, access, stdinType } = options;
    if (file !== undefined) {
        const local = await localFile(file, access);
        return { mimeType: local.mimeType, body: () => createReadStream(local.path), filename: local.filename };
    }

    if ('isTTY' in stdin && stdin.isTTY === true) {
        throw new UsageError('Pass --file <path>, or pipe the contents on stdin.');
    }

    const content = await buffer(stdin);
    return { mimeType: stdinType, body: () => Readable.from([content]) };
}
