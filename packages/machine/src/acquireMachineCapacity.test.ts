import { afterEach, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { waitFor } from '@nzyme/utils/waitFor.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { acquireMachineCapacity } from './acquireMachineCapacity.js';
import type { MachineCapacityRequestOptions } from './MachineCapacityTypes.js';
import { readMachineCapacityStatus } from './readMachineCapacityStatus.js';

/**
 * The slot count is injected; the process table is real, because liveness of real child processes is
 * what is under test.
 */
const SLOTS = 2;
const TIMEOUT_MS = 30_000;

const children: TestChild[] = [];

afterEach(() => {
    for (const child of children.splice(0)) {
        child.process.kill('SIGKILL');
    }
});

test(
    "admits at most as many concurrent requesters as there are slots, in FIFO order, and reuses a dead holder's slot",
    async () => {
        const rootDir = createRootDir();
        const blockers = [
            await acquireMachineCapacity({ ...environment(rootDir), label: 'blocker' }),
            await acquireMachineCapacity({ ...environment(rootDir), label: 'blocker' }),
        ];

        const requesters = [1, 2, 3, 4].map(() => spawnChild({ rootDir, mode: 'acquire' }));
        await waitUntil(() => readMachineCapacityStatus(environment(rootDir)).waiters.length === 4);
        const queue = readMachineCapacityStatus(environment(rootDir)).waiters.map(waiter => waiter.pid);

        for (const blocker of blockers) {
            blocker.release();
        }
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
    'a waiter killed by a signal stops counting',
    async () => {
        const rootDir = createRootDir();
        const blocker = await acquireMachineCapacity({ ...environment(rootDir), label: 'blocker', slots: 1 });

        const child = spawnChild({ rootDir, mode: 'acquire', slots: 1 });
        await waitUntil(() => readMachineCapacityStatus(environment(rootDir)).waiters.length === 1);
        child.process.kill('SIGTERM');
        await waitUntil(() => child.exitCode != null);

        expect(readMachineCapacityStatus(environment(rootDir)).waiters).toEqual([]);
        blocker.release();
    },
    TIMEOUT_MS,
);

test(
    'reservations from different working directories see each other; a stalled request reports its holders',
    async () => {
        const rootDir = createRootDir();
        const holderCwd = createRootDir();
        const stalledCwd = createRootDir();

        const holder = spawnChild({
            rootDir,
            mode: 'acquire',
            cwd: holderCwd,
            slots: 1,
        });
        await waitUntil(() => holder.events.some(event => event.kind === 'granted'));

        const stalled = spawnChild({ rootDir, mode: 'acquire', cwd: stalledCwd, slots: 1, stallTimeoutMs: 200 });
        await waitUntil(() => stalled.exitCode != null);

        const failure = stalled.events.find(event => event.kind === 'error');
        expect(failure?.message).toContain('Machine capacity request child made no progress in the queue');
        expect(failure?.message).toContain('all 1 slots are taken');
        expect(failure?.message).toContain(`child pid ${holder.process.pid} in ${holderCwd}: for`);
        expect(listStateFiles(rootDir, 'waiters')).toEqual([]);
        expect(listStateFiles(rootDir, 'reservations')).toHaveLength(1);
    },
    TIMEOUT_MS,
);

test(
    'moving up the queue restarts the stall timeout',
    async () => {
        const rootDir = createRootDir();
        const blocker = await acquireMachineCapacity({ ...environment(rootDir), label: 'blocker', slots: 1 });
        const head = acquireMachineCapacity({
            ...environment(rootDir),
            label: 'head',
            slots: 1,
            stallTimeoutMs: 1000,
        });
        // Caught here: bun's `expect(promise).rejects` blocks the test until the promise settles.
        const headFailure = head.catch((error: unknown) => String(error));
        await waitUntil(() => readMachineCapacityStatus(environment(rootDir)).waiters.length === 1);

        let clock = Date.now() + 1000;
        const lines: string[] = [];
        let settled = false;
        const failure = acquireMachineCapacity({
            ...environment(rootDir),
            label: 'behind',
            slots: 1,
            now: () => clock,
            stallTimeoutMs: 1000,
            statusIntervalMs: 0,
            onStatus: line => lines.push(line),
        }).catch((error: unknown) => {
            settled = true;
            return String(error);
        });
        await waitUntil(() => lines.some(line => line.includes('position 2')));

        clock += 900;
        expect(await headFailure).toContain('made no progress');
        await waitUntil(() => lines.some(line => line.includes('position 1')));

        clock += 900;
        await waitFor(200);
        expect(settled).toBe(false);

        clock += 200;
        expect(await failure).toContain('made no progress');
        blocker.release();
    },
    TIMEOUT_MS,
);

test('a fresh lock makes others wait and a stale one is removed', async () => {
    const rootDir = createRootDir();
    const lockDir = path.join(rootDir, 'v2', 'lock');
    mkdirSync(lockDir, { recursive: true });

    let granted = false;
    const pending = acquireMachineCapacity({
        ...environment(rootDir),
        label: 'locked-out',
    }).then(reservation => {
        granted = true;
        return reservation;
    });
    await waitFor(200);
    expect(granted).toBe(false);

    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(lockDir, longAgo, longAgo);
    const reservation = await pending;

    expect(listStateFiles(rootDir, 'reservations')).toEqual([`${reservation.id}.json`]);
    reservation.release();
});

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
    mkdirSync(path.join(rootDir, 'v2', 'reservations'), { recursive: true });
    writeReservationRecord(rootDir, 'dead', deadPid, 'Mon Jan 1 00:00:00 2001');
    writeReservationRecord(rootDir, 'reused', process.pid, 'Mon Jan 1 00:00:00 2001');

    const reservation = await acquireMachineCapacity({
        ...environment(rootDir),
        label: 'after-dead',
    });

    expect(listStateFiles(rootDir, 'reservations')).toEqual([`${reservation.id}.json`]);
    reservation.release();
});

test('a live reservation kept by another state version blocks admission', async () => {
    const rootDir = createRootDir();
    mkdirSync(path.join(rootDir, 'v1', 'reservations'), { recursive: true });
    writeFileSync(path.join(rootDir, 'v1', 'reservations', 'x.json'), JSON.stringify({ ownerPid: process.pid }));

    const request = acquireMachineCapacity({
        ...environment(rootDir),
        label: 'old',
        stallTimeoutMs: 100,
    });

    await expect(request).rejects.toThrow('another nzyme version (v1) holds reservations; update nzyme');
});

interface ChildConfig {
    rootDir: string;
    mode: 'acquire' | 'idle';
    cwd?: string;
    slots?: number;
    exitAfterGrant?: boolean;
    stallTimeoutMs?: number;
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

function environment(rootDir: string): Omit<MachineCapacityRequestOptions, 'label'> {
    return { rootDir, slots: SLOTS, pollMs: 25, onStatus: () => {} };
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
                slots: config.slots ?? SLOTS,
                exitAfterGrant: config.exitAfterGrant ?? false,
                stallTimeoutMs: config.stallTimeoutMs,
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

/** The child is a script calling the library against the test's state directory with an injected slot count. */
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

import { acquireMachineCapacity } from ${JSON.stringify(libraryPath)};

const config = JSON.parse(process.argv[2]);
const emit = event => writeSync(1, JSON.stringify(event) + '\\n');
setInterval(() => {}, 60_000);

if (config.mode === 'idle') {
    emit({ kind: 'ready' });
} else {
    try {
        const reservation = await acquireMachineCapacity({
            label: 'child',
            slots: config.slots,
            rootDir: config.rootDir,
            pollMs: 25,
            stallTimeoutMs: config.stallTimeoutMs,
            onStatus: message => emit({ kind: 'status', message }),
        });
        emit({ kind: 'granted', id: reservation.id });
        if (config.exitAfterGrant) {
            process.exit(0);
        }
    } catch (error) {
        emit({ kind: 'error', message: error.message });
        process.exit(1);
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
    return readdirSync(path.join(rootDir, 'v2', kind)).filter(entry => !entry.startsWith('.'));
}

function writeReservationRecord(rootDir: string, id: string, ownerPid: number, ownerStartedAt: string): void {
    writeFileSync(
        path.join(rootDir, 'v2', 'reservations', `${id}.json`),
        JSON.stringify({ id, label: id, cwd: rootDir, ownerPid, ownerStartedAt, createdAt: 0 }),
    );
}

async function spawnAndWaitForExit(): Promise<number> {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise(resolve => {
        child.on('exit', resolve);
    });
    return child.pid ?? -1;
}
