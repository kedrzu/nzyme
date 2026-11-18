import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isErrorCode } from '@nzyme/utils/isErrorCode.js';

import type { TraceLine } from '../TraceLine.js';
import type { TraceProcess } from './TraceProcess.js';

/**
 * Reads every trace file (`<pid>-<threadId>.ndjson`, see `TraceLine`) of `traceDir`, once its
 * processes stopped writing. A missing directory reads as empty: no traced process started. A last
 * line cut short by a process killed mid-write is ignored.
 */
export async function readTraceDir(traceDir: string): Promise<TraceProcess[]> {
    let names: string[];
    try {
        names = await readdir(traceDir);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return [];
        }
        throw error;
    }

    const processes: TraceProcess[] = [];
    for (const name of names.toSorted()) {
        if (!name.endsWith('.ndjson')) {
            continue;
        }
        const process = parseTraceFile(name, await readFile(path.join(traceDir, name), 'utf8'));
        if (process) {
            processes.push(process);
        }
    }
    return processes;
}

/** The process one trace file describes; `undefined` when its `start` line is missing. */
function parseTraceFile(name: string, text: string): TraceProcess | undefined {
    const fileNames = new Map<number, string>();
    let process: TraceProcess | undefined;

    for (const line of text.split('\n')) {
        if (line === '') {
            continue;
        }
        let parsed: TraceLine;
        try {
            // The probe of this package writes the file: its lines are trusted to match the type.
            parsed = JSON.parse(line) as TraceLine;
        } catch {
            // Only the last line can be cut short, by a process killed mid-write.
            break;
        }

        if (parsed.type === 'start') {
            process = { name, bucketMs: parsed.bucketMs, hits: [], stale: new Set() };
            continue;
        }
        if (!process) {
            continue;
        }
        switch (parsed.type) {
            case 'flush': {
                for (const [id, file] of parsed.files) {
                    fileNames.set(id, file);
                }
                const beforeReady = process.readyAt === undefined;
                for (const [bucket, label, fileIds] of parsed.hits) {
                    const files: string[] = [];
                    for (const id of fileIds) {
                        const file = fileNames.get(id);
                        if (file !== undefined) {
                            files.push(file);
                        }
                    }
                    process.hits.push({ bucket, label, files, beforeReady });
                }
                process.flushedAt = parsed.at;
                break;
            }
            case 'ready':
                process.readyAt = parsed.at;
                break;
            case 'stale':
                for (const source of parsed.sources) {
                    process.stale.add(source);
                }
                break;
            case 'end':
                process.endedAt = parsed.at;
                break;
        }
    }
    return process;
}
