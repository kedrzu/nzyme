import type { RawAttachment } from './compose.js';
import { formatFileSize } from './gmailContent.js';

/**
 * The files of a draft for its status line: `, attachments: a.pdf (application/pdf, 2.0 KB)`, and the
 * same for inline images; empty when it has neither.
 * @__NO_SIDE_EFFECTS__
 */
export function formatDraftFiles(inline: RawAttachment[], files: RawAttachment[]): string {
    const groups: [string, RawAttachment[]][] = [
        ['inline images', inline],
        ['attachments', files],
    ];
    return groups
        .filter(([, list]) => list.length > 0)
        .map(([name, list]) => {
            const described = list.map(
                file =>
                    `${file.filename} (${file.contentType ?? 'unknown type'}, ${formatFileSize(file.content.length)})`,
            );
            return `, ${name}: ${described.join(', ')}`;
        })
        .join('');
}
