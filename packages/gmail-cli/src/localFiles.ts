// Local files for drafts (attachments and inline images).
//
// Every path is checked against an explicit allowlist after resolving symlinks, so a
// draft can never carry a file from outside the allowed directories. Secrets inside those roots
// are refused on top of that.

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { detectMimeType } from 'nodemailer/lib/mime-funcs/mime-types';

import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import type { RawAttachment } from './compose.js';
import type { GmailFilesOptions } from './GmailCommandsOptions.js';

/** Gmail refuses to send anything bigger; checking up front beats a half-made draft. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

export interface FileAccess {
    /** Relative paths resolve here. */
    baseDir: string;
    /** Files must live under one of these. */
    roots: string[];
    /** Files or directories never to attach, on top of the built-in secret-file names. */
    denied?: string[];
}

/**
 * The directory `attachment save` writes to: `files.attachmentsDir` with `~` expanded, or
 * `<tmpdir>/gmail-cli/attachments`.
 * @__NO_SIDE_EFFECTS__
 */
export function attachmentsDir(files: GmailFilesOptions | undefined): string {
    const configured = files?.attachmentsDir;
    return configured ? expandHome(configured) : path.join(os.tmpdir(), 'gmail-cli', 'attachments');
}

/**
 * Where a draft may read attachments and inline images from: the project directory (the repo root),
 * `files.roots` and the attachments directory, so a saved attachment can be forwarded. Relative paths
 * resolve against the working directory, as in any shell command.
 */
export function draftFileAccess(files: GmailFilesOptions | undefined): FileAccess {
    return {
        baseDir: process.cwd(),
        roots: [getProjectRoot(), ...(files?.roots ?? []).map(expandHome), attachmentsDir(files)],
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
    const p = input.trim();
    if (!p) {
        throw new Error('Empty file path');
    }
    if (p.startsWith('~')) {
        throw new Error(`'${p}': use an absolute path instead of ~`);
    }

    const candidate = path.resolve(access.baseDir, p);
    let real: string;
    try {
        real = await fs.realpath(candidate);
    } catch {
        throw new Error(`File not found: ${p}`);
    }

    const roots = await realRoots(access.roots);
    if (!roots.some(root => isInside(real, root))) {
        throw new Error(
            `'${p}' is outside the directories attachments may be read from ` +
                `(${access.roots.join(', ')}). Copy the file into the project directory first.`,
        );
    }
    const denied = await realRoots(access.denied ?? []);
    if (isSecretFile(real) || denied.some(d => isInside(real, d))) {
        throw new Error(`'${p}' looks like a secrets file - refusing to attach it`);
    }
    const stat = await fs.stat(real);
    if (!stat.isFile()) {
        throw new Error(`'${p}' is not a regular file`);
    }
    return real;
}

/**
 * Reads an allowed local file as an attachment, typed by its extension.
 */
export async function loadLocalFile(input: string, access: FileAccess): Promise<RawAttachment> {
    const real = await resolveLocalFile(input, access);
    const filename = path.basename(real);
    return {
        filename,
        contentType: detectMimeType(filename),
        content: await fs.readFile(real),
    };
}

/**
 * Throws when the attachments together exceed Gmail's size limit.
 */
export function assertTotalSize(attachments: RawAttachment[]): void {
    let total = 0;
    for (const a of attachments) {
        total += a.content.length;
    }
    if (total > MAX_ATTACHMENTS_BYTES) {
        throw new Error(
            `Attachments total ${megabytes(total)} MB - over Gmail's ${megabytes(MAX_ATTACHMENTS_BYTES)} MB limit. ` +
                'Share big files via a link instead.',
        );
    }
}

function expandHome(dir: string): string {
    return dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
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

function megabytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
}
