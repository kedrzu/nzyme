import type { drive_v3 } from '@googleapis/drive';

import { typeLabel } from './formats.js';

/**
 * A file in a status line: `<id> "<name>" (<type>)`.
 * @__NO_SIDE_EFFECTS__
 */
export function formatDriveFile(file: drive_v3.Schema$File): string {
    return `${file.id} "${(file.name ?? '').replace(/[\r\n]+/g, ' ')}" (${typeLabel(file.mimeType)})`;
}
