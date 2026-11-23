// Local files for drafts (attachments and inline images).

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { detectMimeType } from 'nodemailer/lib/mime-funcs/mime-types';

import type { RawAttachment } from './compose.js';
import { formatFileSize } from './utils/formatFileSize.js';

/** Gmail refuses to send anything bigger; checking up front beats a half-made draft. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

/**
 * Reads a local file as an attachment, typed by its extension. A relative path resolves against the
 * working directory, as in any shell command.
 */
export async function loadLocalFile(input: string): Promise<RawAttachment> {
    const filename = path.basename(input);
    return {
        filename,
        contentType: detectMimeType(filename),
        content: await fs.readFile(input),
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
            `Attachments total ${formatFileSize(total)} - over Gmail's ${formatFileSize(MAX_ATTACHMENTS_BYTES)} limit. ` +
                'Share big files via a link instead.',
        );
    }
}
