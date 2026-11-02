import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, totalmem } from 'node:os';
import * as path from 'node:path';

import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

import { GiB } from './byteUnits.js';
import { sumUnmetReservationBytes } from './computeCapacity.js';
import type { CapacityMemoryRequest, CapacityWorkerRange } from './computeCapacity.js';
import type {
    MachineCapacityEnvironmentOptions,
    MachineCapacityHolder,
    MachineCapacityStatus,
    MachineCapacityWaiter,
} from './MachineCapacityTypes.js';
import { readAvailableMemory } from './readAvailableMemory.js';
import { readCpuLoad } from './readCpuLoad.js';
import { getProcessStartTime, readProcessTable, sumProcessTreeRss } from './readProcessTree.js';
import type { ProcessInfo } from './readProcessTree.js';

/** Bumped whenever the on-disk format changes; other versions are detected, never silently ignored. */
const STATE_VERSION = 'v1';
const DEFAULT_RESERVE_BYTES = 8 * GiB;
const DEFAULT_CPU_THRESHOLD = 0.85;
const DEFAULT_SETTLE_MS = 20_000;
/**
 * A lock is held for one admission decision (well under a second). Past this age its live-looking
 * owner is checked against the process table, which also catches a reused pid.
 */
const LOCK_SUSPECT_AGE_MS = 10_000;

/** A reservation as stored in `reservations/<id>.json`. */
export interface CapacityReservationRecord {
    id: string;
    label: string;
    cwd: string;
    ownerPid: number;
    ownerStartedAt: string;
    bytes: number;
    workers: number;
    createdAt: number;
}

/** A queued request as stored in `waiters/<ticket>.json`. */
export interface CapacityWaiterRecord {
    ticket: string;
    label: string;
    cwd: string;
    pid: number;
    startedAt: string;
    ownerPid: number;
    waitingSince: number;
    nonce: string;
    memory: CapacityMemoryRequest;
    workers: CapacityWorkerRange;
}

/** Live registry state plus the machine readings taken with it. */
export interface CapacityRegistryState {
    status: MachineCapacityStatus;
    table: ProcessInfo[];
}

/** The registry bound to one environment. */
export interface CapacityRegistry {
    settleMs: number;
    readProcessTable: () => ProcessInfo[];
    now: () => number;
    ensureDirs(): void;
    /**
     * Reads live records, then the process table, so every record listed was written by a process that
     * already existed when the table was taken. With `prune`, dead records are deleted (lock holders only).
     */
    readState(prune: boolean): CapacityRegistryState;
    /** Runs `fn` under the registry lock, or returns `undefined` when a live process holds it. */
    tryWithLock<T>(selfStartedAt: string, fn: (holdsLock: () => boolean) => T): { value: T } | undefined;
    writeWaiter(record: CapacityWaiterRecord): void;
    removeWaiter(ticket: string): void;
    writeReservation(record: CapacityReservationRecord): void;
    removeReservation(id: string): void;
    writeLastAdmission(at: number): void;
}

interface LockOwner {
    pid: number;
    startedAt: string;
    nonce: string;
    createdAt: number;
}

/**
 * Binds the machine-global capacity registry to its state directory and machine readers.
 *
 * Mutations of the shared decision state happen under a lock: a `lock/` directory published with its
 * `owner.json` already inside by one atomic `rename`, so the lock never exists without an owner. A lock
 * whose owner is dead (pid gone, or alive with another start time) is moved aside to a unique name before
 * deletion; a stealer that finds it moved a fresh lock instead puts it back, and each lock holder checks
 * it still holds the lock right before writing a grant.
 */
export function createCapacityRegistry(options: MachineCapacityEnvironmentOptions): CapacityRegistry {
    const rootDir = options.rootDir ?? path.join(homedir(), '.nzyme', 'machine', 'capacity');
    const stateDir = path.join(rootDir, STATE_VERSION);
    const lockDir = path.join(stateDir, 'lock');
    const reservationsDir = path.join(stateDir, 'reservations');
    const waitersDir = path.join(stateDir, 'waiters');
    const lastAdmissionFile = path.join(stateDir, 'last-admission');

    const readMemory = options.readAvailableMemory ?? readAvailableMemory;
    const readTotal = options.readTotalMemory ?? totalmem;
    const readCpu = options.readCpuLoad ?? readCpuLoad;
    const readTable = options.readProcessTable ?? readProcessTable;
    const reserveBytes = options.reserveBytes ?? DEFAULT_RESERVE_BYTES;
    const cpuThreshold = options.cpuThreshold ?? DEFAULT_CPU_THRESHOLD;

    return {
        settleMs: options.settleMs ?? DEFAULT_SETTLE_MS,
        readProcessTable: readTable,
        now: options.now ?? Date.now,
        ensureDirs,
        readState,
        tryWithLock,
        writeWaiter,
        removeWaiter,
        writeReservation,
        removeReservation,
        writeLastAdmission,
    };

    function ensureDirs(): void {
        mkdirSync(reservationsDir, { recursive: true });
        mkdirSync(waitersDir, { recursive: true });
    }

    function readState(prune: boolean): CapacityRegistryState {
        const reservations = listRecords(reservationsDir, parseReservation, prune);
        const waiters = listRecords(waitersDir, parseWaiter, prune);
        const otherVersionOwners = listOtherVersionOwners();
        const table = readTable();

        const holders: MachineCapacityHolder[] = [];
        for (const { file, record } of reservations) {
            if (getProcessStartTime(table, record.ownerPid) !== record.ownerStartedAt) {
                if (prune) {
                    removeFile(file);
                }
                continue;
            }

            holders.push({
                id: record.id,
                label: record.label,
                cwd: record.cwd,
                ownerPid: record.ownerPid,
                bytes: record.bytes,
                workers: record.workers,
                createdAt: record.createdAt,
                currentRssBytes: sumProcessTreeRss(table, record.ownerPid),
            });
        }

        const liveWaiters: CapacityWaiterRecord[] = [];
        for (const { file, record } of waiters) {
            if (getProcessStartTime(table, record.pid) !== record.startedAt) {
                if (prune) {
                    removeFile(file);
                }
                continue;
            }
            liveWaiters.push(record);
        }
        liveWaiters.sort(compareWaiters);

        const otherVersions = otherVersionOwners
            .filter(({ owners }) => owners.some(owner => isOwnerAlive(table, owner)))
            .map(({ version }) => version);

        const availableBytes = readMemory();
        const unmetBytes = sumUnmetReservationBytes(holders);

        const status: MachineCapacityStatus = {
            availableBytes,
            totalBytes: readTotal(),
            reserveBytes,
            unmetBytes,
            freeBytes: availableBytes - unmetBytes - reserveBytes,
            cpu: readCpu(),
            cpuThreshold,
            lastAdmissionAt: readLastAdmission(),
            holders,
            waiters: liveWaiters.map(toWaiterStatus),
            otherVersions,
        };

        return { status, table };
    }

    function tryWithLock<T>(selfStartedAt: string, fn: (holdsLock: () => boolean) => T): { value: T } | undefined {
        const owner: LockOwner = {
            pid: process.pid,
            startedAt: selfStartedAt,
            nonce: randomUUID(),
            createdAt: Date.now(),
        };

        if (!publishLock(owner)) {
            removeStaleLock();
            return undefined;
        }

        try {
            return { value: fn(() => readLockOwner(lockDir)?.nonce === owner.nonce) };
        } finally {
            releaseLock(owner);
        }
    }

    function publishLock(owner: LockOwner): boolean {
        const pending = path.join(stateDir, `.lock-${owner.nonce}`);
        mkdirSync(pending, { recursive: true });
        writeFileSync(path.join(pending, 'owner.json'), JSON.stringify(owner));

        try {
            renameSync(pending, lockDir);
            return true;
        } catch (error) {
            rmSync(pending, { recursive: true, force: true });
            const code = errnoCode(error);
            if (code === 'ENOTEMPTY' || code === 'EEXIST') {
                return false;
            }
            throw error;
        }
    }

    function releaseLock(owner: LockOwner): void {
        if (readLockOwner(lockDir)?.nonce !== owner.nonce) {
            return;
        }

        const released = path.join(stateDir, `.released-${owner.nonce}`);
        try {
            renameSync(lockDir, released);
        } catch (error) {
            if (errnoCode(error) === 'ENOENT') {
                return;
            }
            throw error;
        }
        rmSync(released, { recursive: true, force: true });
    }

    function removeStaleLock(): void {
        const owner = readLockOwner(lockDir);
        if (!owner || !isLockOwnerDead(owner)) {
            return;
        }

        const grave = path.join(stateDir, `.stale-${randomUUID()}`);
        try {
            renameSync(lockDir, grave);
        } catch (error) {
            if (errnoCode(error) === 'ENOENT') {
                return;
            }
            throw error;
        }

        if (readLockOwner(grave)?.nonce !== owner.nonce) {
            // Another stealer replaced the dead lock and a live process published a fresh one in
            // between: put that one back. If yet another lock appeared meanwhile, the displaced holder
            // notices through `holdsLock` before it writes anything.
            try {
                renameSync(grave, lockDir);
                return;
            } catch {
                // Fall through and discard it.
            }
        }
        rmSync(grave, { recursive: true, force: true });
    }

    function isLockOwnerDead(owner: LockOwner): boolean {
        if (!isPidRunning(owner.pid)) {
            return true;
        }

        if (Date.now() - owner.createdAt < LOCK_SUSPECT_AGE_MS) {
            return false;
        }

        const table = readTable();
        return getProcessStartTime(table, owner.pid) !== owner.startedAt;
    }

    function writeWaiter(record: CapacityWaiterRecord): void {
        writeFileAtomically(waitersDir, `${record.ticket}.json`, JSON.stringify(record));
    }

    function removeWaiter(ticket: string): void {
        removeFile(path.join(waitersDir, `${ticket}.json`));
    }

    function writeReservation(record: CapacityReservationRecord): void {
        writeFileAtomically(reservationsDir, `${record.id}.json`, JSON.stringify(record));
    }

    function removeReservation(id: string): void {
        removeFile(path.join(reservationsDir, `${id}.json`));
    }

    function writeLastAdmission(at: number): void {
        writeFileAtomically(stateDir, 'last-admission', String(at));
    }

    function readLastAdmission(): number | undefined {
        const raw = readFileOrUndefined(lastAdmissionFile);
        const value = Number(raw);

        return raw != null && Number.isFinite(value) ? value : undefined;
    }

    /** Owners of reservations kept by other state versions; their files are read leniently, by pid only. */
    function listOtherVersionOwners(): { version: string; owners: OtherVersionOwner[] }[] {
        let entries: string[];
        try {
            entries = readdirSync(rootDir);
        } catch (error) {
            if (errnoCode(error) === 'ENOENT') {
                return [];
            }
            throw error;
        }

        const result: { version: string; owners: OtherVersionOwner[] }[] = [];
        for (const version of entries) {
            if (version === STATE_VERSION || !/^v\d+$/.test(version)) {
                continue;
            }

            const owners = listRecords(path.join(rootDir, version, 'reservations'), parseOtherVersionOwner, false).map(
                ({ record }) => record,
            );
            result.push({ version, owners });
        }

        return result;
    }
}

interface OtherVersionOwner {
    ownerPid: number;
    ownerStartedAt: string | undefined;
}

/** FIFO by wait start, tie-broken by pid then nonce for a total order every process agrees on. */
function compareWaiters(a: CapacityWaiterRecord, b: CapacityWaiterRecord): number {
    if (a.waitingSince !== b.waitingSince) {
        return a.waitingSince - b.waitingSince;
    }
    if (a.pid !== b.pid) {
        return a.pid - b.pid;
    }
    return a.nonce < b.nonce ? -1 : a.nonce > b.nonce ? 1 : 0;
}

function toWaiterStatus(record: CapacityWaiterRecord): MachineCapacityWaiter {
    return {
        ticket: record.ticket,
        label: record.label,
        cwd: record.cwd,
        pid: record.pid,
        ownerPid: record.ownerPid,
        waitingSince: record.waitingSince,
        memory: record.memory,
        workers: record.workers,
    };
}

function isOwnerAlive(table: readonly ProcessInfo[], owner: OtherVersionOwner): boolean {
    const startedAt = getProcessStartTime(table, owner.ownerPid);

    return startedAt != null && (owner.ownerStartedAt == null || owner.ownerStartedAt === startedAt);
}

/**
 * Lists the `*.json` records of a directory. Records are published by rename, so an unparseable one is
 * corrupt rather than half-written: it counts for nothing and is deleted when pruning.
 */
function listRecords<T>(
    dir: string,
    parse: (value: unknown) => T | undefined,
    prune: boolean,
): { file: string; record: T }[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch (error) {
        if (errnoCode(error) === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const records: { file: string; record: T }[] = [];
    for (const entry of entries) {
        if (!entry.endsWith('.json') || entry.startsWith('.')) {
            continue;
        }

        const file = path.join(dir, entry);
        const raw = readFileOrUndefined(file);
        if (raw == null) {
            continue;
        }

        const record = parse(parseJson(raw));
        if (record) {
            records.push({ file, record });
        } else if (prune) {
            removeFile(file);
        }
    }

    return records;
}

function parseReservation(value: unknown): CapacityReservationRecord | undefined {
    if (
        !isObject(value) ||
        typeof value.id !== 'string' ||
        typeof value.label !== 'string' ||
        typeof value.cwd !== 'string' ||
        typeof value.ownerPid !== 'number' ||
        typeof value.ownerStartedAt !== 'string' ||
        typeof value.bytes !== 'number' ||
        typeof value.workers !== 'number' ||
        typeof value.createdAt !== 'number'
    ) {
        return undefined;
    }

    return {
        id: value.id,
        label: value.label,
        cwd: value.cwd,
        ownerPid: value.ownerPid,
        ownerStartedAt: value.ownerStartedAt,
        bytes: value.bytes,
        workers: value.workers,
        createdAt: value.createdAt,
    };
}

function parseWaiter(value: unknown): CapacityWaiterRecord | undefined {
    if (
        !isObject(value) ||
        typeof value.ticket !== 'string' ||
        typeof value.label !== 'string' ||
        typeof value.cwd !== 'string' ||
        typeof value.pid !== 'number' ||
        typeof value.startedAt !== 'string' ||
        typeof value.ownerPid !== 'number' ||
        typeof value.waitingSince !== 'number' ||
        typeof value.nonce !== 'string' ||
        !isObject(value.memory) ||
        typeof value.memory.base !== 'number' ||
        typeof value.memory.perWorker !== 'number' ||
        !isObject(value.workers) ||
        typeof value.workers.min !== 'number' ||
        typeof value.workers.max !== 'number'
    ) {
        return undefined;
    }

    return {
        ticket: value.ticket,
        label: value.label,
        cwd: value.cwd,
        pid: value.pid,
        startedAt: value.startedAt,
        ownerPid: value.ownerPid,
        waitingSince: value.waitingSince,
        nonce: value.nonce,
        memory: { base: value.memory.base, perWorker: value.memory.perWorker },
        workers: { min: value.workers.min, max: value.workers.max },
    };
}

function parseOtherVersionOwner(value: unknown): OtherVersionOwner | undefined {
    if (!isObject(value) || typeof value.ownerPid !== 'number') {
        return undefined;
    }

    return {
        ownerPid: value.ownerPid,
        ownerStartedAt: typeof value.ownerStartedAt === 'string' ? value.ownerStartedAt : undefined,
    };
}

function readLockOwner(dir: string): LockOwner | undefined {
    const raw = readFileOrUndefined(path.join(dir, 'owner.json'));
    const value: unknown = raw == null ? undefined : parseJson(raw);

    if (
        !isObject(value) ||
        typeof value.pid !== 'number' ||
        typeof value.startedAt !== 'string' ||
        typeof value.nonce !== 'string' ||
        typeof value.createdAt !== 'number'
    ) {
        return undefined;
    }

    return { pid: value.pid, startedAt: value.startedAt, nonce: value.nonce, createdAt: value.createdAt };
}

function writeFileAtomically(dir: string, name: string, content: string): void {
    const pending = path.join(dir, `.${name}.${randomUUID()}.tmp`);
    writeFileSync(pending, content);
    renameSync(pending, path.join(dir, name));
}

function isPidRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process exists but belongs to someone we may not signal.
        return errnoCode(error) === 'EPERM';
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function readFileOrUndefined(file: string): string | undefined {
    try {
        return readFileSync(file, 'utf8');
    } catch (error) {
        if (errnoCode(error) === 'ENOENT') {
            return undefined;
        }
        throw new ApplicationError('Cannot read machine capacity state', { file, cause: error });
    }
}

function removeFile(file: string): void {
    try {
        unlinkSync(file);
    } catch (error) {
        if (errnoCode(error) !== 'ENOENT') {
            throw error;
        }
    }
}

function errnoCode(error: unknown): string | undefined {
    if (isObject(error) && typeof error.code === 'string') {
        return error.code;
    }
    return undefined;
}
