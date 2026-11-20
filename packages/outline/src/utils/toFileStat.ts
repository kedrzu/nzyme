import type { Stats } from 'node:fs';

import type { FileStat } from '../state/StateStore.js';

/**
 * What identifies an unchanged file without reading it.
 * @util
 */
export function toFileStat(stats: Stats): FileStat {
    return { mtimeMs: stats.mtimeMs, size: stats.size, ino: stats.ino };
}
