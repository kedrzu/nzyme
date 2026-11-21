import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';

import type { TraceLine } from '../TraceLine.js';

/**
 * Appends trace lines to one NDJSON file. Writes are synchronous so a line is on disk before the
 * process can die, and so the final lines can be written from an `exit` handler.
 */
export class TraceWriter {
    private readonly fd: number;

    constructor(filePath: string) {
        mkdirSync(path.dirname(filePath), { recursive: true });
        this.fd = openSync(filePath, 'a');
    }

    write(line: TraceLine) {
        writeSync(this.fd, JSON.stringify(line) + '\n');
    }

    close() {
        closeSync(this.fd);
    }
}
