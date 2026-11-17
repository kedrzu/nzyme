import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { TraceLine } from '../TraceLine.js';
import { createTraceDirReader } from './createTraceDirReader.js';
import type { TraceProcess } from './TraceProcess.js';

let traceDir: string;

beforeAll(async () => {
    traceDir = await mkdtemp(path.join(tmpdir(), 'trace-dir-'));
});

afterAll(async () => {
    await rm(traceDir, { recursive: true, force: true });
});

test('reads what processes append, a line cut mid-write on a later read, and hits before ready as startup', async () => {
    const reader = createTraceDirReader(traceDir);
    const file = path.join(traceDir, '1-0.ndjson');
    expect(await reader.read()).toEqual([]);

    await append(file, [
        { type: 'start', at: 0, pid: 1, threadId: 0, argv: [], cwd: '/', root: '/', bucketMs: 100 },
        { type: 'flush', at: 100, files: [[0, 'boot.ts']], hits: [[0, null, [0]]] },
        { type: 'ready', at: 150 },
    ]);
    const flush: TraceLine = { type: 'flush', at: 300, files: [[1, 'ąę.ts']], hits: [[2, 'a', [0, 1]]] };
    const bytes = Buffer.from(JSON.stringify(flush) + '\n');
    // Cut inside the two-byte `ą`.
    const cut = bytes.indexOf(Buffer.from('ą')) + 1;
    await appendFile(file, bytes.subarray(0, cut));

    expect(await reader.read()).toEqual([
        expected({
            readyAt: 150,
            flushedAt: 100,
            hits: [{ bucket: 0, label: null, files: ['boot.ts'], beforeReady: true }],
        }),
    ]);

    await appendFile(file, bytes.subarray(cut));
    await append(file, [
        { type: 'stale', at: 310, file: 'dist/x.js', sources: ['x.ts'] },
        { type: 'end', at: 320 },
    ]);

    expect(await reader.read()).toEqual([
        expected({
            readyAt: 150,
            flushedAt: 300,
            endedAt: 320,
            stale: new Set(['x.ts']),
            hits: [
                { bucket: 0, label: null, files: ['boot.ts'], beforeReady: true },
                { bucket: 2, label: 'a', files: ['boot.ts', 'ąę.ts'], beforeReady: false },
            ],
        }),
    ]);
});

async function append(file: string, lines: TraceLine[]) {
    await appendFile(file, lines.map(line => JSON.stringify(line) + '\n').join(''));
}

function expected(overrides: Partial<TraceProcess>): TraceProcess {
    return { name: '1-0.ndjson', bucketMs: 100, hits: [], stale: new Set(), ...overrides };
}
