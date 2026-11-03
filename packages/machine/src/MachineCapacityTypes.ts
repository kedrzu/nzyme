import type { CapacityMemoryRequest, CapacityWorkerRange } from './computeCapacity.js';
import type { CpuLoad } from './readCpuLoad.js';
import type { ProcessInfo } from './readProcessTree.js';

/**
 * Where the machine-global capacity registry lives and how the machine is read. Every field has a
 * production default; tests override them to get a private registry and deterministic readings.
 */
export interface MachineCapacityEnvironmentOptions {
    /**
     * Parent of the versioned state directories; defaults to `~/.nzyme/machine/capacity`, shared by
     * every repository of the user on this machine.
     */
    rootDir?: string;
    /** Memory always left to the user and to everything outside the registry; defaults to 8 GiB. */
    reserveBytes?: number;
    /** Fraction of cores the 1-minute load must stay below for an admission; defaults to 0.85. */
    cpuThreshold?: number;
    /** Minimum time between two admissions on the machine; defaults to 20 s. */
    settleMs?: number;
    readAvailableMemory?: () => number;
    readTotalMemory?: () => number;
    readCpuLoad?: () => CpuLoad;
    readProcessTable?: () => ProcessInfo[];
    now?: () => number;
}

/** A heavy run asking for memory and parallelism. */
export interface MachineCapacityRequestOptions extends MachineCapacityEnvironmentOptions {
    /** Shown to other users of the machine, e.g. `e2e` or `tests`. */
    label: string;
    memory: CapacityMemoryRequest;
    workers: CapacityWorkerRange;
    /**
     * Process whose lifetime bounds the reservation; defaults to the calling process. A reservation
     * owned by another process has no release hook here: it ends when that process exits.
     */
    ownerPid?: number;
    /** How long a waiting request tolerates its place in the queue not improving before it fails; defaults to 30 min. */
    stallTimeoutMs?: number;
    /** Receives `[nzyme machine]` status lines; defaults to writing them to stderr. */
    onStatus?: (line: string) => void;
    /** How often a waiting request re-checks capacity; defaults to 500 ms. */
    pollMs?: number;
    /** Minimum time between two status reports while waiting; defaults to 15 s. */
    statusIntervalMs?: number;
    /** How often the owner's peak memory is sampled while the reservation is held; defaults to 5 s. */
    sampleIntervalMs?: number;
}

/** A granted reservation. */
export interface MachineCapacityReservation {
    id: string;
    /** Parallel workers the run may use. */
    workers: number;
    /** Bytes reserved: `base + workers × perWorker`. */
    bytes: number;
    /**
     * Removes the reservation; idempotent. When the caller owns the reservation it also runs on
     * process exit, and warns when the process tree peaked above the reservation.
     */
    release(): void;
}

/** A live reservation as seen by everyone on the machine. */
export interface MachineCapacityHolder {
    id: string;
    label: string;
    cwd: string;
    ownerPid: number;
    bytes: number;
    workers: number;
    createdAt: number;
    /** RSS of the owner's process tree right now. */
    currentRssBytes: number;
}

/** A live queued request. */
export interface MachineCapacityWaiter {
    ticket: string;
    label: string;
    cwd: string;
    /** The process doing the waiting. */
    pid: number;
    ownerPid: number;
    waitingSince: number;
    memory: CapacityMemoryRequest;
    workers: CapacityWorkerRange;
}

/** Read-only snapshot of the machine and the registry. */
export interface MachineCapacityStatus {
    availableBytes: number;
    totalBytes: number;
    reserveBytes: number;
    /** Reserved by live holders but not yet used by their process trees. */
    unmetBytes: number;
    /** `available − unmet − reserve`; what a new request could get now. */
    freeBytes: number;
    cpu: CpuLoad;
    cpuThreshold: number;
    lastAdmissionAt: number | undefined;
    holders: MachineCapacityHolder[];
    /** In admission order. */
    waiters: MachineCapacityWaiter[];
    /**
     * Other state versions (e.g. `v2`) with live reservations: a different nzyme shares the machine,
     * and admission is blocked until it is gone or this nzyme is updated.
     */
    otherVersions: string[];
}
