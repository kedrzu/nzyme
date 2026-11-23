import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { TraceLine } from '../TraceLine.js';
import { readTraceDir } from './readTraceDir.js';
import type { TraceProcess } from './TraceProcess.js';

let traceDir: string;

beforeAll(async () => {
    traceDir = await mkdtemp(path.join(tmpdir(), 'trace-dir-'));
});

afterAll(async () => {
    await rm(traceDir, { recursive: true, force: true });
});

test('reads hits before ready as startup, and ignores a last line cut by a killed process', async () => {
    const lines: TraceLine[] = [
        { type: 'start', at: 0, pid: 1, threadId: 0, argv: [], cwd: '/', root: '/', bucketMs: 100 },
        { type: 'flush', at: 100, files: [[0, 'boot.ts']], hits: [[0, null, [0]]] },
        { type: 'ready', at: 150 },
        { type: 'stale', at: 160, file: 'dist/x.js', sources: ['x.ts'] },
        { type: 'flush', at: 300, files: [[1, 'ąę.ts']], hits: [[2, 'a', [0, 1]]] },
    ];
    const cut = JSON.stringify({ type: 'flush', at: 400, files: [], hits: [[3, 'a', [1]]] }).slice(0, 20);
    await writeFile(path.join(traceDir, '1-0.ndjson'), lines.map(line => JSON.stringify(line) + '\n').join('') + cut);

    const expected: TraceProcess[] = [
        {
            name: '1-0.ndjson',
            bucketMs: 100,
            readyAt: 150,
            flushedAt: 300,
            stale: new Set(['x.ts']),
            hits: [
                { bucket: 0, label: null, files: ['boot.ts'], beforeReady: true },
                { bucket: 2, label: 'a', files: ['boot.ts', 'ąę.ts'], beforeReady: false },
            ],
        },
    ];
    expect(await readTraceDir(traceDir)).toEqual(expected);
});

test('a missing directory reads as no process', async () => {
    expect(await readTraceDir(path.join(traceDir, 'missing'))).toEqual([]);
});
