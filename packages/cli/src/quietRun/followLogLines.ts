import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';

/** Inputs for {@link followLogLines}. */
export interface FollowLogLinesOptions {
    /** The file to follow; it must exist. */
    path: string;
    /** Receives every complete line appended to the file, without its newline, in order. */
    onLine: (line: string) => void;
}

/** Reads a growing file line by line; see {@link followLogLines}. */
export interface LogLineFollower {
    /** Reads what was appended since the last read and emits its complete lines. */
    poll(): Promise<void>;
    /** Reads the rest of the file, emits the last line even without a trailing newline, and closes the file. */
    finish(): Promise<void>;
}

const CHUNK_BYTES = 64 * 1024;

/**
 * Follows a file another process appends to, like `tail -f`: each read starts where the previous one
 * ended, so a line is emitted once, and a line still being written is held back until its newline
 * arrives. Reads never overlap, so `poll` may be called from a timer while a previous poll runs.
 */
export async function followLogLines(options: FollowLogLinesOptions): Promise<LogLineFollower> {
    const { onLine } = options;
    const file = await open(options.path, 'r');
    const decoder = new StringDecoder('utf8');
    const buffer = Buffer.alloc(CHUNK_BYTES);
    let offset = 0;
    let pending = '';
    let queue = Promise.resolve();

    return {
        poll: () => enqueue(readAppended),
        finish: () => enqueue(readRest),
    };

    function enqueue(step: () => Promise<void>): Promise<void> {
        queue = queue.then(step);
        return queue;
    }

    async function readAppended(): Promise<void> {
        for (;;) {
            const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
            if (bytesRead === 0) {
                break;
            }

            offset += bytesRead;
            pending += decoder.write(buffer.subarray(0, bytesRead));
        }

        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
            onLine(line);
        }
    }

    async function readRest(): Promise<void> {
        try {
            await readAppended();
            const last = pending + decoder.end();
            pending = '';
            if (last !== '') {
                onLine(last);
            }
        } finally {
            await file.close();
        }
    }
}
