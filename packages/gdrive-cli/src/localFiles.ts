// Local files for uploads and downloads.
//
// Every path is checked against an explicit allowlist after resolving symlinks, so an upload can never
// carry a file from outside the project directory and the configured roots, and a download can never
// land outside them. Secrets inside those roots are refused on top of that.

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { assertFileAccess, resolveReadableFile } from '@nzyme/node-utils/FileAccess.js';
import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';
import { safeFileName } from '@nzyme/node-utils/safeFileName.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import type { DriveFilesOptions } from './DriveCommandsOptions.js';

/** An allowed local file to upload. */
export interface LocalFile {
    path: string;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * The directory `download` writes to by default: `files.downloadsDir`, or `~/.cache/gdrive-cli/downloads`
 * (per user, unlike a fixed name under a shared temp directory another user could create first).
 * @__NO_SIDE_EFFECTS__
 */
export function downloadsDir(files: DriveFilesOptions | undefined): string {
    return files?.downloadsDir ?? path.join(os.homedir(), '.cache', 'gdrive-cli', 'downloads');
}

/**
 * Where uploads may read and downloads may write: the project directory (the repo root), `files.roots`
 * and the downloads directory. Relative paths resolve against the working directory, as in any shell
 * command.
 */
export function driveFileAccess(files: DriveFilesOptions | undefined): FileAccess {
    return {
        baseDir: process.cwd(),
        roots: [getProjectRoot(), ...(files?.roots ?? []), downloadsDir(files)],
    };
}

/**
 * An allowed local file, typed by its extension.
 */
export async function localFile(input: string, access: FileAccess): Promise<LocalFile> {
    const real = await resolveReadableFile(input, access);
    const filename = path.basename(real);
    const stat = await fs.stat(real);
    return { path: real, filename, mimeType: mimeTypeOf(filename), size: stat.size };
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
    defaultName: string;
    access: FileAccess;
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
    access,
    overwrite = false,
}: ResolveWritablePathParams): Promise<string> {
    // assertFileAccess refuses an empty path or one starting with `~` before anything is created.
    const p = input.trim();
    let target = path.resolve(access.baseDir, p);
    const isDir = /[\\/]$/.test(p) || (await isDirectory(target));
    if (isDir) {
        target = path.join(target, safeFileName(defaultName, 'download'));
    }

    // The nearest existing ancestor decides where the new directories would end up.
    let existing = path.dirname(target);
    while (!(await exists(existing))) {
        existing = path.dirname(existing);
    }

    const rest = path.relative(existing, path.dirname(target));
    await assertFileAccess({
        real: path.join(await fs.realpath(existing), rest, path.basename(target)),
        shown: p,
        access,
        verb: 'write',
    });

    await fs.mkdir(path.dirname(target), { recursive: true });
    const real = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
    await assertFileAccess({ real, shown: p, access, verb: 'write' });

    const stat = await fs.lstat(real).catch(() => null);
    if (stat) {
        if (!stat.isFile()) {
            throw new Error(`'${p}' exists and is not a regular file`);
        }

        if (!overwrite) {
            throw new Error(`'${p}' already exists - pass --overwrite to replace it, or choose another path`);
        }
    }

    return real;
}

async function isDirectory(target: string) {
    try {
        return (await fs.stat(target)).isDirectory();
    } catch {
        return false;
    }
}

async function exists(target: string) {
    try {
        await fs.stat(target);
        return true;
    } catch {
        return false;
    }
}
