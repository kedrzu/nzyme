import { formatBytes } from './formatBytes.js';
import type { CpuLoad } from './readCpuLoad.js';

/** Memory a heavy run needs: a fixed part plus a part per parallel worker, in bytes. */
export interface CapacityMemoryRequest {
    base: number;
    perWorker: number;
}

/** How many parallel workers a heavy run accepts. */
export interface CapacityWorkerRange {
    min: number;
    max: number;
}

/** What a live reservation promised and what its process tree uses right now. */
export interface CapacityHolderUsage {
    /** Bytes the reservation was granted. */
    bytes: number;
    /** Current RSS of the owner's process tree, in bytes. */
    currentRssBytes: number;
}

/** Readings and policy one admission decision is made from. */
export interface ComputeCapacityParams {
    memory: CapacityMemoryRequest;
    workers: CapacityWorkerRange;
    /** Memory available right now (`readAvailableMemory()`). */
    availableBytes: number;
    /** Physical memory of the machine (`os.totalmem()`); decides whether the request can ever fit. */
    totalBytes: number;
    /** Memory always left to the user and everything outside the registry. */
    reserveBytes: number;
    holders: readonly CapacityHolderUsage[];
    cpu: CpuLoad;
    /** Fraction of cores the 1-minute load must stay below for an admission. */
    cpuThreshold: number;
    now: number;
    /** When the previous admission happened, if ever. */
    lastAdmissionAt: number | undefined;
    /** Minimum time between admissions: load average lags behind a run that just started. */
    settleMs: number;
}

/** Outcome of one admission decision. */
export type CapacityDecision =
    | { kind: 'grant'; workers: number; bytes: number }
    | { kind: 'wait'; reason: string }
    | { kind: 'never-fits'; reason: string };

/**
 * Decides how many workers a heavy run may start with right now. Memory reserved by live holders but
 * not yet used by their process trees counts as taken, so several runs starting together cannot all
 * see the same free memory.
 * @__NO_SIDE_EFFECTS__
 */
export function computeCapacity(params: ComputeCapacityParams): CapacityDecision {
    const { memory, workers, reserveBytes } = params;
    const minimumBytes = memory.base + workers.min * memory.perWorker;
    const usableBytes = params.totalBytes - reserveBytes;

    if (minimumBytes > usableBytes) {
        return {
            kind: 'never-fits',
            reason:
                `needs at least ${formatBytes(minimumBytes)} (${describeRequest(memory, workers.min)}), ` +
                `but this machine can only ever offer ${formatBytes(usableBytes)} ` +
                `(${formatBytes(params.totalBytes)} total − ${formatBytes(reserveBytes)} kept free)`,
        };
    }

    const unmetBytes = sumUnmetReservationBytes(params.holders);
    const freeBytes = params.availableBytes - unmetBytes - reserveBytes;
    const fittingWorkers = countFittingWorkers(freeBytes, memory, workers.max);

    if (fittingWorkers < workers.min) {
        return {
            kind: 'wait',
            reason:
                `missing ${formatBytes(minimumBytes - freeBytes)} of memory: needs ${formatBytes(minimumBytes)} ` +
                `(${describeRequest(memory, workers.min)}), free ${formatBytes(freeBytes)} = ` +
                `${formatBytes(params.availableBytes)} available − ${formatBytes(unmetBytes)} reserved but not yet used − ` +
                `${formatBytes(reserveBytes)} kept free`,
        };
    }

    const loadLimit = params.cpuThreshold * params.cpu.cores;
    if (params.cpu.load1m >= loadLimit) {
        return {
            kind: 'wait',
            reason:
                `CPU load ${params.cpu.load1m.toFixed(1)} is at or above ${loadLimit.toFixed(1)} ` +
                `(${Math.round(params.cpuThreshold * 100)}% of ${params.cpu.cores} cores)`,
        };
    }

    if (params.lastAdmissionAt != null) {
        const settleLeftMs = params.lastAdmissionAt + params.settleMs - params.now;
        if (settleLeftMs > 0) {
            return {
                kind: 'wait',
                reason: `letting the load average settle after the previous admission (${Math.ceil(settleLeftMs / 1000)}s left)`,
            };
        }
    }

    return { kind: 'grant', workers: fittingWorkers, bytes: memory.base + fittingWorkers * memory.perWorker };
}

/**
 * Sums memory that live reservations were granted but their process trees do not use yet; a holder
 * using more than it reserved contributes nothing rather than a negative amount.
 * @__NO_SIDE_EFFECTS__
 */
export function sumUnmetReservationBytes(holders: readonly CapacityHolderUsage[]): number {
    let total = 0;
    for (const holder of holders) {
        total += Math.max(0, holder.bytes - holder.currentRssBytes);
    }

    return total;
}

function countFittingWorkers(freeBytes: number, memory: CapacityMemoryRequest, max: number): number {
    if (freeBytes < memory.base) {
        return -1;
    }

    if (memory.perWorker <= 0) {
        return max;
    }

    return Math.min(max, Math.floor((freeBytes - memory.base) / memory.perWorker));
}

function describeRequest(memory: CapacityMemoryRequest, workers: number): string {
    return `base ${formatBytes(memory.base)} + ${workers} × ${formatBytes(memory.perWorker)} per worker`;
}
