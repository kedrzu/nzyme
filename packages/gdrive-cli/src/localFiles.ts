// Local files for uploads and downloads. A relative path resolves against the working directory, as in
// any shell command.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { safeFileName } from '@nzyme/node-utils/safeFileName.js';

/** A local file to upload. */
export interface LocalFile {
    path: string;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * A local regular file, typed by its extension.
 */
export async function localFile(input: string): Promise<LocalFile> {
    const stat = await fs.stat(input);
    if (!stat.isFile()) {
        throw new Error(`'${input}' is not a regular file`);
    }

    const filename = path.basename(input);
    return { path: path.resolve(input), filename, mimeType: mimeTypeOf(filename), size: stat.size };
}

/**
 * The MIME type of a file name, by its extension; `application/octet-stream` when unknown.
 * @__NO_SIDE_EFFECTS__
 */
export function mimeTypeOf(filename: string): string {
    // Bun has no entry for Markdown; Drive needs it to convert .md into a Google Doc.
    if (/\.(md|markdown)$/i.test(filename)) {
        return 'text/markdown';
    }

    return Bun.file(filename).type.split(';')[0] || 'application/octet-stream';
}

/** Params of {@link resolveWritablePath}. */
export interface ResolveWritablePathParams {
    /** A file path, or a directory (an existing one, or a path ending in `/`) to put `defaultName` in. */
    input: string;
    /** The name Drive gave the file, sanitised before use: Drive chooses it, not the caller. */
    defaultName: string;
    /** Replace an existing file; refused by default. */
    overwrite?: boolean;
}

/**
 * Where a download may be written. Missing parent directories are created; an existing file is
 * replaced only with `overwrite`.
 */
export async function resolveWritablePath({
    input,
    defaultName,
    overwrite = false,
}: ResolveWritablePathParams): Promise<string> {
    let target = path.resolve(input);
    const isDir = /[\\/]$/.test(input) || (await isDirectory(target));
    if (isDir) {
        target = path.join(target, safeFileName(defaultName, 'download'));
    }

    await fs.mkdir(path.dirname(target), { recursive: true });

    const stat = await fs.lstat(target).catch(() => null);
    if (stat) {
        if (!stat.isFile()) {
            throw new Error(`'${input}' exists and is not a regular file`);
        }

        if (!overwrite) {
            throw new Error(`'${input}' already exists - pass --overwrite to replace it, or choose another path`);
        }
    }

    return target;
}

async function isDirectory(target: string) {
    try {
        return (await fs.stat(target)).isDirectory();
    } catch {
        return false;
    }
}
