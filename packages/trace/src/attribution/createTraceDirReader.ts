import { open, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { TraceLine } from '../TraceLine.js';
import type { TraceProcess } from './TraceProcess.js';

/** Reads a trace directory incrementally, as processes keep appending to their files. */
export interface TraceDirReader {
    /**
     * Reads what was appended since the previous call and returns every process seen so far. A file
     * whose `start` line is not written yet is not returned; a trailing line still being written is
     * read on a later call.
     */
    read(): Promise<TraceProcess[]>;
}

/**
 * Opens a reader of the trace files (`<pid>-<threadId>.ndjson`, see `TraceLine`) in `traceDir`. A
 * missing directory reads as empty: no traced process has started.
 */
export function createTraceDirReader(traceDir: string): TraceDirReader {
    const files = new Map<string, TraceFileState>();

    return { read };

    async function read(): Promise<TraceProcess[]> {
        let names: string[];
        try {
            names = await readdir(traceDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }

        const processes: TraceProcess[] = [];
        for (const name of names.toSorted()) {
            if (!name.endsWith('.ndjson')) {
                continue;
            }
            let state = files.get(name);
            if (!state) {
                state = { offset: 0, pending: Buffer.alloc(0), fileNames: new Map(), process: undefined, name };
                files.set(name, state);
            }
            await readAppended(state);
            if (state.process) {
                processes.push(state.process);
            }
        }
        return processes;
    }

    async function readAppended(state: TraceFileState): Promise<void> {
        const handle = await open(path.join(traceDir, state.name), 'r');
        try {
            const { size } = await handle.stat();
            if (size <= state.offset) {
                return;
            }
            const buffer = Buffer.alloc(size - state.offset);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, state.offset);
            state.offset += bytesRead;
            const bytes = Buffer.concat([state.pending, buffer.subarray(0, bytesRead)]);
            // A line not terminated yet is kept, as bytes, for the next read.
            const complete = bytes.lastIndexOf(0x0a) + 1;
            state.pending = bytes.subarray(complete);
            for (const line of bytes.subarray(0, complete).toString('utf8').split('\n')) {
                if (line !== '') {
                    // The probe of this package writes the file: its lines are trusted to match the type.
                    applyLine(state, JSON.parse(line) as TraceLine);
                }
            }
        } finally {
            await handle.close();
        }
    }
}

interface TraceFileState {
    name: string;
    /** Bytes read so far. */
    offset: number;
    /** The bytes of a line not terminated yet. */
    pending: Buffer;
    fileNames: Map<number, string>;
    process: TraceProcess | undefined;
}

function applyLine(state: TraceFileState, line: TraceLine): void {
    if (line.type === 'start') {
        state.process = { name: state.name, bucketMs: line.bucketMs, hits: [], stale: new Set() };
        return;
    }

    const process = state.process;
    if (!process) {
        return;
    }
    switch (line.type) {
        case 'flush': {
            for (const [id, file] of line.files) {
                state.fileNames.set(id, file);
            }
            const beforeReady = process.readyAt === undefined;
            for (const [bucket, label, fileIds] of line.hits) {
                const files: string[] = [];
                for (const id of fileIds) {
                    const file = state.fileNames.get(id);
                    if (file !== undefined) {
                        files.push(file);
                    }
                }
                process.hits.push({ bucket, label, files, beforeReady });
            }
            process.flushedAt = line.at;
            break;
        }
        case 'ready':
            process.readyAt = line.at;
            break;
        case 'stale':
            for (const source of line.sources) {
                process.stale.add(source);
            }
            break;
        case 'end':
            process.endedAt = line.at;
            break;
    }
}
