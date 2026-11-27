import { execFileSync } from 'node:child_process';

import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/** One row of the process table. */
export interface ProcessInfo {
    pid: number;
    /** `ps` start time (`lstart` in UTC, whitespace-normalized); differs when a pid is reused by another process. */
    startTime: string;
}

/**
 * Snapshots all processes with a single `ps -A`.
 * @util
 */
export function readProcessTable(): ProcessInfo[] {
    const output = execFileSync('ps', ['-A', '-o', 'pid=,lstart='], {
        encoding: 'utf8',
        // `lstart` prints in the reader's locale and timezone, but start times are compared across processes.
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        maxBuffer: 64 * 1024 * 1024,
    });

    return parseProcessTable(output);
}

/** Parses `ps -A -o pid=,lstart=` output. */
export function parseProcessTable(text: string): ProcessInfo[] {
    const table: ProcessInfo[] = [];

    for (const line of text.split('\n')) {
        if (line.trim() === '') {
            continue;
        }

        const match = /^\s*(\d+)\s+(\S.*?)\s*$/.exec(line);

        if (!match) {
            throw new ApplicationError('Unrecognized ps output line', { line });
        }

        table.push({ pid: Number(match[1]), startTime: (match[2] ?? '').replace(/\s+/g, ' ') });
    }

    return table;
}

/**
 * Returns the start time of `pid` in the snapshot, or `undefined` when it is not running.
 * @util
 */
export function getProcessStartTime(table: readonly ProcessInfo[], pid: number): string | undefined {
    return table.find(info => info.pid === pid)?.startTime;
}
