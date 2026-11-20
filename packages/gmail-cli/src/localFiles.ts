// Local files for drafts (attachments and inline images).
//
// Every path is checked against an explicit allowlist after resolving symlinks, so a
// draft can never carry a file from outside the allowed directories. Secrets inside those roots
// are refused on top of that.

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { detectMimeType } from 'nodemailer/lib/mime-funcs/mime-types';

import { expandHome } from '@nzyme/node-utils/expandHome.js';
import type { FileAccess } from '@nzyme/node-utils/FileAccess.js';
import { resolveReadableFile } from '@nzyme/node-utils/resolveReadableFile.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import type { RawAttachment } from './compose.js';
import type { GmailFilesOptions } from './GmailCommandsOptions.js';

/** Gmail refuses to send anything bigger; checking up front beats a half-made draft. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

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
 * Reads an allowed local file as an attachment, typed by its extension.
 */
export async function loadLocalFile(input: string, access: FileAccess): Promise<RawAttachment> {
    const real = await resolveReadableFile(input, access);
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

function megabytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
}
