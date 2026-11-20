// Local files for uploads and downloads.
//
// Every path is checked against an explicit allowlist after resolving symlinks, so an upload can never
// carry a file from outside the project directory and the configured roots, and a download can never
// land outside them. Secrets inside those roots are refused on top of that.

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import type { DriveFilesOptions } from './DriveCommandsOptions.js';

/** Where local files may be read and written. */
export interface FileAccess {
    /** Relative paths resolve here. */
    baseDir: string;
    /** Files must live under one of these. */
    roots: string[];
}

/** An allowed local file to upload. */
export interface LocalFile {
    path: string;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * The directory `download` writes to by default: `files.downloadsDir` with `~` expanded, or
 * `<tmpdir>/gdrive-cli/downloads`.
 * @__NO_SIDE_EFFECTS__
 */
export function downloadsDir(files: DriveFilesOptions | undefined): string {
    const configured = files?.downloadsDir;
    return configured ? expandHome(configured) : path.join(os.tmpdir(), 'gdrive-cli', 'downloads');
}

/**
 * Where uploads may read and downloads may write: the project directory (the repo root), `files.roots`
 * and the downloads directory. Relative paths resolve against the working directory, as in any shell
 * command.
 */
export function driveFileAccess(files: DriveFilesOptions | undefined): FileAccess {
    return {
        baseDir: process.cwd(),
        roots: [getProjectRoot(), ...(files?.roots ?? []).map(expandHome), downloadsDir(files)],
    };
}

/**
 * Whether a configured directory is absolute or home-relative (`~`), as `files` options must be.
 * @__NO_SIDE_EFFECTS__
 */
export function isConfiguredPath(dir: string): boolean {
    return path.isAbsolute(dir) || dir === '~' || dir.startsWith('~/');
}

/**
 * Absolute path of a readable regular file inside the allowed roots, or an error.
 */
export async function resolveLocalFile(input: string, access: FileAccess): Promise<string> {
    const p = checkInput(input);
    let real: string;
    try {
        real = await fs.realpath(path.resolve(access.baseDir, p));
    } catch {
        throw new Error(`File not found: ${p}`);
    }

    await assertAllowed(real, p, access, 'read');
    const stat = await fs.stat(real);
    if (!stat.isFile()) {
        throw new Error(`'${p}' is not a regular file`);
    }

    return real;
}

/**
 * An allowed local file, typed by its extension.
 */
export async function localFile(input: string, access: FileAccess): Promise<LocalFile> {
    const real = await resolveLocalFile(input, access);
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

/**
 * Where a download may be written. `input` is a file path, or a directory (an existing one, or a path
 * ending in `/`) to put `defaultName` in. Missing parent directories are created; an existing file is
 * replaced only with `overwrite`.
 */
export async function resolveWritablePath(
    input: string,
    defaultName: string,
    access: FileAccess,
    overwrite = false,
): Promise<string> {
    const p = checkInput(input);
    let target = path.resolve(access.baseDir, p);
    const isDir = /[\\/]$/.test(p) || (await isDirectory(target));
    if (isDir) {
        target = path.join(target, safeFileName(defaultName));
    }

    // The nearest existing ancestor decides where the new directories would end up.
    let existing = path.dirname(target);
    while (!(await exists(existing))) {
        existing = path.dirname(existing);
    }

    const rest = path.relative(existing, path.dirname(target));
    await assertAllowed(path.join(await fs.realpath(existing), rest, path.basename(target)), p, access, 'write');

    await fs.mkdir(path.dirname(target), { recursive: true });
    const real = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
    await assertAllowed(real, p, access, 'write');

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

/**
 * A Drive name made safe for the local filesystem: no separators, no control characters, no leading dot.
 * @__NO_SIDE_EFFECTS__
 */
export function safeFileName(name: string): string {
    // Control characters sort below the space.
    const replaced = Array.from(name, char => (char < ' ' || '\\/:*?"<>|'.includes(char) ? '_' : char)).join('');
    const cleaned = replaced.replace(/^\.+/, '_').trim();
    return cleaned || 'download';
}

function expandHome(dir: string): string {
    return dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
}

function checkInput(input: string): string {
    const p = input.trim();
    if (!p) {
        throw new Error('Empty file path');
    }

    if (p.startsWith('~')) {
        throw new Error(`'${p}': use an absolute path instead of ~`);
    }

    return p;
}

async function assertAllowed(real: string, shown: string, access: FileAccess, verb: 'read' | 'write') {
    const roots = await realRoots(access.roots);
    if (!roots.some(root => isInside(real, root))) {
        throw new Error(
            `'${shown}' is outside the directories Drive commands may ${verb} ` +
                `(${access.roots.join(', ')}). Use a path inside the project directory.`,
        );
    }

    if (isSecretFile(real)) {
        throw new Error(`'${shown}' looks like a secrets file - refusing to ${verb} it`);
    }
}

// Secrets living next to the allowed files: .env files, OAuth credentials/tokens.
function isSecretFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    return name.startsWith('.env') || /-(credentials|tokens)\.json$/.test(name);
}

function isInside(filePath: string, root: string): boolean {
    const rel = path.relative(root, filePath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function realRoots(roots: string[]): Promise<string[]> {
    const resolved = await Promise.all(roots.map(r => fs.realpath(r).catch(() => null)));
    return resolved.filter(r => r !== null);
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
