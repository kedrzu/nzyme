import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { platform } from 'node:os';

import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/**
 * Reads memory that can be handed to new work without swapping, in bytes: macOS free + inactive +
 * speculative + purgeable pages, Linux `MemAvailable`. `os.freemem()` is not used because on macOS it
 * ignores the (large) reclaimable inactive cache.
 * @util
 */
export function readAvailableMemory(): number {
    switch (platform()) {
        case 'darwin':
            return parseVmStatAvailableBytes(execFileSync('vm_stat', { encoding: 'utf8' }));
        case 'linux':
            return parseMeminfoAvailableBytes(readFileSync('/proc/meminfo', 'utf8'));
        default:
            throw new ApplicationError('Reading available memory is not supported on this platform', {
                platform: platform(),
            });
    }
}

/** Parses `vm_stat` output into available bytes; the page size comes from the header line. */
export function parseVmStatAvailableBytes(text: string): number {
    const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);

    if (!Number.isFinite(pageSize) || pageSize <= 0) {
        throw new ApplicationError('vm_stat output has no page size header', { output: text });
    }

    let pages = 0;
    for (const name of ['free', 'inactive', 'speculative', 'purgeable']) {
        const match = new RegExp(`^Pages ${name}:\\s+(\\d+)\\.?\\s*$`, 'm').exec(text);

        if (!match) {
            throw new ApplicationError(`vm_stat output has no "Pages ${name}" line`, { output: text });
        }

        pages += Number(match[1]);
    }

    return pages * pageSize;
}

/** Parses `/proc/meminfo` content into the `MemAvailable` value in bytes. */
export function parseMeminfoAvailableBytes(text: string): number {
    const match = /^MemAvailable:\s+(\d+)\s*kB\s*$/m.exec(text);

    if (!match) {
        throw new ApplicationError('/proc/meminfo has no MemAvailable line', { content: text });
    }

    return Number(match[1]) * 1024;
}
