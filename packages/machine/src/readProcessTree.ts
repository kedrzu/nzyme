import { execFileSync } from 'node:child_process';

import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/** One row of the process table. */
export interface ProcessInfo {
    pid: number;
    ppid: number;
    /** Resident set size in bytes. */
    rssBytes: number;
    /** `ps` start time (`lstart`, whitespace-normalized); differs when a pid is reused by another process. */
    startTime: string;
}

/**
 * Snapshots all processes with a single `ps -A`.
 * @util
 */
export function readProcessTable(): ProcessInfo[] {
    const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,lstart='], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C' },
        maxBuffer: 64 * 1024 * 1024,
    });

    return parseProcessTable(output);
}

/** Parses `ps -A -o pid=,ppid=,rss=,lstart=` output; `ps` reports rss in KiB. */
export function parseProcessTable(text: string): ProcessInfo[] {
    const table: ProcessInfo[] = [];

    for (const line of text.split('\n')) {
        if (line.trim() === '') {
            continue;
        }

        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S.*?)\s*$/.exec(line);

        if (!match) {
            throw new ApplicationError('Unrecognized ps output line', { line });
        }

        table.push({
            pid: Number(match[1]),
            ppid: Number(match[2]),
            rssBytes: Number(match[3]) * 1024,
            startTime: (match[4] ?? '').replace(/\s+/g, ' '),
        });
    }

    return table;
}

/** Sums RSS (bytes) of `pid` and all its descendants, walking ppid links of one snapshot. */
export function sumProcessTreeRss(table: readonly ProcessInfo[], pid: number): number {
    const children = new Map<number, ProcessInfo[]>();
    const byPid = new Map<number, ProcessInfo>();

    for (const info of table) {
        byPid.set(info.pid, info);
        children.set(info.ppid, [...(children.get(info.ppid) ?? []), info]);
    }

    let total = 0;
    const visited = new Set<number>();
    const pending = [pid];

    for (let current = pending.pop(); current != null; current = pending.pop()) {
        if (visited.has(current)) {
            continue;
        }

        visited.add(current);
        total += byPid.get(current)?.rssBytes ?? 0;

        for (const child of children.get(current) ?? []) {
            pending.push(child.pid);
        }
    }

    return total;
}

/** Returns the start time of `pid` in the snapshot, or `undefined` when it is not running. */
export function getProcessStartTime(table: readonly ProcessInfo[], pid: number): string | undefined {
    return table.find(info => info.pid === pid)?.startTime;
}
