import { afterEach, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { waitFor } from '@nzyme/utils/waitFor.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { acquireMachineCapacity, assertMachineCapacity } from './acquireMachineCapacity.js';
import { GiB, MiB } from './byteUnits.js';
import type { CapacityMemoryRequest } from './computeCapacity.js';
import type { MachineCapacityRequestOptions } from './MachineCapacityTypes.js';
import { readMachineCapacityStatus } from './readMachineCapacityStatus.js';

/**
 * Memory readings are injected (so admission does not depend on this machine's real memory); the
 * process table is real, because liveness of real child processes is what is under test. Real RSS of
 * a child (tens of MiB) only shrinks its unmet reservation slightly, far below the GiB-sized margins.
 */
const TOTAL_BYTES = 64 * GiB;
const AVAILABLE_BYTES = 5 * GiB;
/** Each child asks for 2 GiB, so 5 GiB of available memory fits exactly two of them. */
const CHILD_MEMORY = { base: 1 * GiB, perWorker: 1 * GiB };
const TIMEOUT_MS = 30_000;

const children: TestChild[] = [];

afterEach(() => {
    for (const child of children.splice(0)) {
        child.process.kill('SIGKILL');
    }
});

test(
    "admits at most as many concurrent requesters as memory allows, in FIFO order, and reuses a dead holder's memory",
    async () => {
        const rootDir = createRootDir();
        const blocker = await acquireMachineCapacity({ ...environment(rootDir), ...blockerRequest() });

        const requesters = [1, 2, 3, 4].map(() => spawnChild({ rootDir, mode: 'acquire' }));
        await waitUntil(() => readMachineCapacityStatus(environment(rootDir)).waiters.length === 4);
        const queue = readMachineCapacityStatus(environment(rootDir)).waiters.map(waiter => waiter.pid);

        blocker.release();
        await waitUntil(() => grantedPids(requesters).length === 2);
        // Several poll rounds later nobody else got in.
        await waitFor(500);
        expect(grantedPids(requesters).toSorted()).toEqual(queue.slice(0, 2).toSorted());

        const firstHolder = requesters.find(child => child.process.pid === queue[0]);
        firstHolder?.process.kill('SIGKILL');
        await waitUntil(() => grantedPids(requesters).length === 3);
        await waitFor(500);

        expect(grantedPids(requesters).toSorted()).toEqual(queue.slice(0, 3).toSorted());
        expect(readMachineCapacityStatus(environment(rootDir)).waiters.map(waiter => waiter.pid)).toEqual(
            queue.slice(3),
        );
    },
    TIMEOUT_MS,
);

test(
    'a waiter interrupted by SIGTERM or an aborted signal leaves the queue',
    async () => {
        const rootDir = createRootDir();
        const blocker = await acquireMachineCapacity({ ...environment(rootDir), ...blockerRequest() });

        const child = spawnChild({ rootDir, mode: 'acquire' });
        await waitUntil(() => listStateFiles(rootDir, 'waiters').length === 1);
        child.process.kill('SIGTERM');
        await waitUntil(() => child.exitCode != null);

        expect(child.exitCode).toBe(143);
        expect(listStateFiles(rootDir, 'waiters')).toEqual([]);

        const controller = new AbortController();
        const pending = acquireMachineCapacity({
            ...environment(rootDir),
            label: 'aborted',
            memory: CHILD_MEMORY,
            workers: { min: 1, max: 1 },
            signal: controller.signal,
        });
        await waitUntil(() => listStateFiles(rootDir, 'waiters').length === 1);
        controller.abort();

        await expect(pending).rejects.toThrow('aborted');
        expect(listStateFiles(rootDir, 'waiters')).toEqual([]);
        blocker.release();
    },
    TIMEOUT_MS,
);

test(
    'reservations from different working directories see each other; assert reports numbers and holders',
    async () => {
        const rootDir = createRootDir();
        const holderCwd = createRootDir();
        const assertingCwd = createRootDir();

        const holder = spawnChild({
            rootDir,
            mode: 'acquire',
            cwd: holderCwd,
            memory: { base: 4 * GiB, perWorker: 0 },
        });
        await waitUntil(() => holder.events.some(event => event.kind === 'granted'));

        const asserting = spawnChild({ rootDir, mode: 'assert', cwd: assertingCwd });
        await waitUntil(() => asserting.exitCode != null);

        const failure = asserting.events.find(event => event.kind === 'error');
        expect(failure?.message).toContain('Not enough machine capacity for child');
        expect(failure?.message).toContain('missing');
        expect(failure?.message).toContain(`child pid ${holder.process.pid} in ${holderCwd}: reserved 4.0 GiB`);
        expect(listStateFiles(rootDir, 'waiters')).toEqual([]);
        expect(listStateFiles(rootDir, 'reservations')).toHaveLength(1);
    },
    TIMEOUT_MS,
);

test(
    'the owner process releases its reservation when it exits',
    async () => {
        const rootDir = createRootDir();

        const child = spawnChild({ rootDir, mode: 'acquire', exitAfterGrant: true });
        await waitUntil(() => child.exitCode != null);

        expect(child.events.some(event => event.kind === 'granted')).toBe(true);
        expect(listStateFiles(rootDir, 'reservations')).toEqual([]);
    },
    TIMEOUT_MS,
);

test(
    'a reservation owned by another process ends when that process exits',
    async () => {
        const rootDir = createRootDir();
        const owner = spawnChild({ rootDir, mode: 'idle' });
        await waitUntil(() => owner.events.some(event => event.kind === 'ready'));

        const reservation = await acquireMachineCapacity({
            ...environment(rootDir),
            label: 'for-owner',
            memory: CHILD_MEMORY,
            workers: { min: 1, max: 1 },
            ownerPid: owner.process.pid,
        });
        expect(readMachineCapacityStatus(environment(rootDir)).holders.map(holder => holder.id)).toEqual([
            reservation.id,
        ]);

        owner.process.kill('SIGKILL');
        await waitUntil(() => owner.exitCode != null);

        expect(readMachineCapacityStatus(environment(rootDir)).holders).toEqual([]);
    },
    TIMEOUT_MS,
);

test('records of a dead pid or of a reused pid stop counting and are pruned', async () => {
    const rootDir = createRootDir();
    const deadPid = await spawnAndWaitForExit();
    mkdirSync(path.join(rootDir, 'v1', 'reservations'), { recursive: true });
    writeReservationRecord(rootDir, 'dead', deadPid, 'Mon Jan 1 00:00:00 2001');
    writeReservationRecord(rootDir, 'reused', process.pid, 'Mon Jan 1 00:00:00 2001');

    const reservation = await acquireMachineCapacity({
        ...environment(rootDir),
        label: 'after-dead',
        memory: CHILD_MEMORY,
        workers: { min: 1, max: 1 },
    });

    expect(listStateFiles(rootDir, 'reservations')).toEqual([`${reservation.id}.json`]);
    reservation.release();
});

test('a live reservation kept by another state version blocks admission', async () => {
    const rootDir = createRootDir();
    mkdirSync(path.join(rootDir, 'v2', 'reservations'), { recursive: true });
    writeFileSync(path.join(rootDir, 'v2', 'reservations', 'x.json'), JSON.stringify({ ownerPid: process.pid }));

    const request = assertMachineCapacity({
        ...environment(rootDir),
        label: 'old',
        memory: CHILD_MEMORY,
        workers: { min: 1, max: 1 },
    });

    await expect(request).rejects.toThrow('another nzyme version (v2) holds reservations; update nzyme');
});

test('a request that can never fit fails at once and leaves no waiter', async () => {
    const rootDir = createRootDir();

    const request = acquireMachineCapacity({
        ...environment(rootDir),
        label: 'huge',
        memory: { base: 100 * GiB, perWorker: 0 },
        workers: { min: 1, max: 1 },
    });

    await expect(request).rejects.toThrow('can only ever offer 64.0 GiB');
    expect(listStateFiles(rootDir, 'waiters')).toEqual([]);
});

test('warns on release when the process tree peaked above the reservation', async () => {
    const rootDir = createRootDir();
    const lines: string[] = [];

    const reservation = await acquireMachineCapacity({
        ...environment(rootDir),
        label: 'tiny',
        memory: { base: 1 * MiB, perWorker: 0 },
        workers: { min: 1, max: 1 },
        onStatus: line => lines.push(line),
    });
    reservation.release();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith('[nzyme machine] tiny peaked at');
});

test(
    'warns when the owner exits without releasing, as a run that holds its reservation to the end does',
    async () => {
        const rootDir = createRootDir();

        const child = spawnChild({
            rootDir,
            mode: 'acquire',
            memory: { base: 1 * MiB, perWorker: 0 },
            exitAfterGrant: true,
        });
        await waitUntil(() => child.exitCode != null);

        expect(child.events.some(event => event.message?.includes('child peaked at'))).toBe(true);
    },
    TIMEOUT_MS,
);

interface ChildConfig {
    rootDir: string;
    mode: 'acquire' | 'assert' | 'idle';
    cwd?: string;
    memory?: CapacityMemoryRequest;
    exitAfterGrant?: boolean;
}

interface ChildEvent {
    kind: 'granted' | 'error' | 'ready' | 'status';
    message?: string;
}

interface TestChild {
    process: ChildProcess;
    events: ChildEvent[];
    exitCode: number | null | undefined;
}

function environment(rootDir: string): Omit<MachineCapacityRequestOptions, 'label' | 'memory' | 'workers'> {
    return {
        rootDir,
        reserveBytes: 0,
        settleMs: 0,
        readAvailableMemory: () => AVAILABLE_BYTES,
        readTotalMemory: () => TOTAL_BYTES,
        readCpuLoad: () => ({ cores: 8, load1m: 0, load5m: 0, load15m: 0 }),
        pollMs: 25,
        onStatus: () => {},
    };
}

/** Takes all injected memory: its unmet part (5 GiB minus this process's RSS) leaves less than a child needs. */
function blockerRequest(): Pick<MachineCapacityRequestOptions, 'label' | 'memory' | 'workers'> {
    return { label: 'blocker', memory: { base: AVAILABLE_BYTES, perWorker: 0 }, workers: { min: 1, max: 1 } };
}

function spawnChild(config: ChildConfig): TestChild {
    const script = writeChildScript();
    const childProcess = spawn(
        process.execPath,
        [
            script,
            JSON.stringify({
                rootDir: config.rootDir,
                mode: config.mode,
                memory: config.memory ?? CHILD_MEMORY,
                exitAfterGrant: config.exitAfterGrant ?? false,
                availableBytes: AVAILABLE_BYTES,
                totalBytes: TOTAL_BYTES,
            }),
        ],
        { cwd: config.cwd ?? config.rootDir, stdio: ['ignore', 'pipe', 'inherit'] },
    );

    const child: TestChild = { process: childProcess, events: [], exitCode: undefined };
    let buffer = '';
    childProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
            child.events.push(JSON.parse(line) as ChildEvent);
        }
    });
    childProcess.on('exit', (code, signal) => {
        child.exitCode = code ?? (signal ? -1 : null);
    });
    children.push(child);

    return child;
}

let childScript: string | undefined;

/** The child is a script calling the library against the test's state directory with injected readings. */
function writeChildScript(): string {
    if (childScript) {
        return childScript;
    }

    const dir = mkdtempSync(path.join(tmpdir(), 'nzyme-machine-child-'));
    childScript = path.join(dir, 'child.ts');
    const libraryPath = path.join(import.meta.dir, 'acquireMachineCapacity.ts');
    writeFileSync(
        childScript,
        `
import { writeSync } from 'node:fs';

import { acquireMachineCapacity, assertMachineCapacity } from ${JSON.stringify(libraryPath)};

const config = JSON.parse(process.argv[2]);
const emit = event => writeSync(1, JSON.stringify(event) + '\\n');
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
setInterval(() => {}, 60_000);

if (config.mode === 'idle') {
    emit({ kind: 'ready' });
} else {
    const request = config.mode === 'assert' ? assertMachineCapacity : acquireMachineCapacity;
    try {
        const reservation = await request({
            label: 'child',
            memory: config.memory,
            workers: { min: 1, max: 1 },
            rootDir: config.rootDir,
            reserveBytes: 0,
            settleMs: 0,
            pollMs: 25,
            readAvailableMemory: () => config.availableBytes,
            readTotalMemory: () => config.totalBytes,
            readCpuLoad: () => ({ cores: 8, load1m: 0, load5m: 0, load15m: 0 }),
            signal: controller.signal,
            onStatus: message => emit({ kind: 'status', message }),
        });
        emit({ kind: 'granted', workers: reservation.workers });
        if (config.exitAfterGrant) {
            process.exit(0);
        }
    } catch (error) {
        emit({ kind: 'error', message: error.message });
        process.exit(controller.signal.aborted ? 143 : 1);
    }
}
`,
    );

    return childScript;
}

function grantedPids(requesters: TestChild[]): number[] {
    return requesters
        .filter(child => child.events.some(event => event.kind === 'granted'))
        .map(child => child.process.pid ?? -1);
}

function createRootDir(): string {
    return realpathSync(mkdtempSync(path.join(tmpdir(), 'nzyme-machine-')));
}

function listStateFiles(rootDir: string, kind: 'waiters' | 'reservations'): string[] {
    return readdirSync(path.join(rootDir, 'v1', kind)).filter(entry => !entry.startsWith('.'));
}

function writeReservationRecord(rootDir: string, id: string, ownerPid: number, ownerStartedAt: string): void {
    writeFileSync(
        path.join(rootDir, 'v1', 'reservations', `${id}.json`),
        JSON.stringify({
            id,
            label: id,
            cwd: rootDir,
            ownerPid,
            ownerStartedAt,
            bytes: 100 * GiB,
            workers: 1,
            createdAt: 0,
        }),
    );
}

async function spawnAndWaitForExit(): Promise<number> {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise(resolve => {
        child.on('exit', resolve);
    });
    return child.pid ?? -1;
}
