import { randomUUID } from 'node:crypto';

import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { formatDurationMs } from '@nzyme/utils/formatDurationMs.js';
import { waitFor } from '@nzyme/utils/waitFor.js';

import { computeCapacity } from './computeCapacity.js';
import { createCapacityRegistry } from './createCapacityRegistry.js';
import type { CapacityRegistry, CapacityReservationRecord, CapacityWaiterRecord } from './createCapacityRegistry.js';
import { formatBytes } from './formatBytes.js';
import { formatMachineCapacityStatus, MACHINE_STATUS_PREFIX } from './formatMachineCapacityStatus.js';
import type {
    MachineCapacityRequestOptions,
    MachineCapacityReservation,
    MachineCapacityStatus,
} from './MachineCapacityTypes.js';
import { getProcessStartTime, sumProcessTreeRss } from './readProcessTree.js';

const DEFAULT_POLL_MS = 500;
const DEFAULT_STATUS_INTERVAL_MS = 15_000;
const DEFAULT_SAMPLE_INTERVAL_MS = 5_000;
/** Longer than any measured heavy run, so a queue only stalls this long when something is stuck. */
const DEFAULT_STALL_TIMEOUT_MS = 30 * 60_000;

/**
 * Waits in the machine-global FIFO queue until memory and CPU allow at least `workers.min` workers, then
 * reserves `base + W × perWorker` bytes for the largest W up to `workers.max`. The reservation counts
 * against every other heavy run on the machine, from any repository, until it is released or its owner
 * exits.
 *
 * Throws at once when the request can never fit this machine, and with the numbers, the holders and the
 * queue when its place in the queue has not improved for `stallTimeoutMs`: a run behind a stuck head of
 * the queue fails instead of hanging. A waiter killed by a signal stops counting, because its pid is dead.
 */
export async function acquireMachineCapacity(
    options: MachineCapacityRequestOptions,
): Promise<MachineCapacityReservation> {
    const request = prepareRequest(options);
    const { registry } = request;
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    const statusIntervalMs = options.statusIntervalMs ?? DEFAULT_STATUS_INTERVAL_MS;
    const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

    registry.ensureDirs();
    const nonce = randomUUID();
    const waitingSince = registry.now();
    const waiter: CapacityWaiterRecord = {
        ticket: `${waitingSince}-${process.pid}-${nonce}`,
        label: options.label,
        cwd: process.cwd(),
        pid: process.pid,
        startedAt: request.selfStartedAt,
        ownerPid: request.ownerPid,
        waitingSince,
        nonce,
        memory: options.memory,
        workers: options.workers,
    };
    registry.writeWaiter(waiter);

    try {
        let lastStatusAt = Number.NEGATIVE_INFINITY;
        let bestPosition = Number.POSITIVE_INFINITY;
        let progressAt = waitingSince;

        for (;;) {
            const attempt = registry.tryWithLock(() => decide(request, waiter));
            if (attempt) {
                const outcome = attempt.value;
                switch (outcome.kind) {
                    case 'grant':
                        return createReservation(request, outcome.record);
                    case 'refuse':
                        throw outcome.error;
                    case 'wait': {
                        const now = registry.now();
                        if (outcome.position < bestPosition) {
                            bestPosition = outcome.position;
                            progressAt = now;
                        }
                        if (now - progressAt >= stallTimeoutMs) {
                            throw new ApplicationError(
                                [
                                    `Machine capacity request ${options.label} made no progress in the queue for ` +
                                        `${formatDurationMs(now - progressAt)}: ${outcome.reason}`,
                                    ...formatMachineCapacityStatus(outcome.status, now),
                                ].join('\n'),
                                { label: options.label, status: outcome.status },
                            );
                        }
                        if (now - lastStatusAt >= statusIntervalMs) {
                            lastStatusAt = now;
                            emitLines(request, describeWait(options.label, outcome, now));
                        }
                        break;
                    }
                }
            }

            await waitFor(pollMs);
        }
    } finally {
        registry.removeWaiter(waiter.ticket);
    }
}

interface PreparedRequest {
    options: MachineCapacityRequestOptions;
    registry: CapacityRegistry;
    selfStartedAt: string;
    ownerPid: number;
    ownerStartedAt: string;
}

interface WaitOutcome {
    kind: 'wait';
    reason: string;
    status: MachineCapacityStatus;
    /** 1-based place in the queue. */
    position: number;
}

type DecisionOutcome =
    | { kind: 'grant'; record: CapacityReservationRecord }
    | WaitOutcome
    | { kind: 'refuse'; error: ApplicationError };

function prepareRequest(options: MachineCapacityRequestOptions): PreparedRequest {
    validateRequest(options);

    const registry = createCapacityRegistry(options);
    const table = registry.readProcessTable();
    const selfStartedAt = getProcessStartTime(table, process.pid);
    if (selfStartedAt == null) {
        throw new ApplicationError('The current process is missing from the process table', { pid: process.pid });
    }

    const ownerPid = options.ownerPid ?? process.pid;
    const ownerStartedAt = getProcessStartTime(table, ownerPid);
    if (ownerStartedAt == null) {
        throw new ApplicationError(`Cannot reserve machine capacity for pid ${ownerPid}: it is not running`, {
            label: options.label,
            ownerPid,
        });
    }

    return { options, registry, selfStartedAt, ownerPid, ownerStartedAt };
}

function validateRequest(options: MachineCapacityRequestOptions): void {
    const { memory, workers } = options;

    if (options.label.trim() === '') {
        throw new ApplicationError('Machine capacity request needs a label', {});
    }

    if (!isNonNegativeNumber(memory.base) || !isNonNegativeNumber(memory.perWorker)) {
        throw new ApplicationError('Machine capacity memory must be non-negative byte counts', { memory });
    }

    if (
        !Number.isSafeInteger(workers.min) ||
        workers.min < 1 ||
        !Number.isSafeInteger(workers.max) ||
        workers.max < workers.min
    ) {
        throw new ApplicationError('Machine capacity workers must be integers with 1 <= min <= max', { workers });
    }
}

/** One admission decision; runs under the registry lock. */
function decide(request: PreparedRequest, waiter: CapacityWaiterRecord): DecisionOutcome {
    const { registry, options } = request;
    const { status, table } = registry.readState(true);
    const now = registry.now();

    if (getProcessStartTime(table, request.ownerPid) !== request.ownerStartedAt) {
        return {
            kind: 'refuse',
            error: new ApplicationError(
                `Process ${request.ownerPid} exited before machine capacity for ${options.label} was granted`,
                { label: options.label, ownerPid: request.ownerPid },
            ),
        };
    }

    const decision = computeCapacity({
        memory: options.memory,
        workers: options.workers,
        availableBytes: status.availableBytes,
        totalBytes: status.totalBytes,
        reserveBytes: status.reserveBytes,
        holders: status.holders,
        cpu: status.cpu,
        cpuThreshold: status.cpuThreshold,
        now,
        lastAdmissionAt: status.lastAdmissionAt,
        settleMs: registry.settleMs,
    });

    if (decision.kind === 'never-fits') {
        return {
            kind: 'refuse',
            error: new ApplicationError(`Machine capacity request ${options.label} ${decision.reason}`, {
                label: options.label,
                memory: options.memory,
                workers: options.workers,
            }),
        };
    }

    let ahead = status.waiters.findIndex(entry => entry.ticket === waiter.ticket);
    if (ahead === -1) {
        // Our ticket was deleted by hand; requeue it with the original wait start.
        registry.writeWaiter(waiter);
        ahead = status.waiters.filter(entry => entry.waitingSince <= waiter.waitingSince).length;
    }
    const position = ahead + 1;

    if (status.otherVersions.length > 0) {
        return {
            kind: 'wait',
            reason: `another nzyme version (${status.otherVersions.join(', ')}) holds reservations; update nzyme`,
            status,
            position,
        };
    }

    if (ahead > 0) {
        return { kind: 'wait', reason: `${ahead} request(s) queued ahead`, status, position };
    }

    if (decision.kind === 'wait') {
        return { kind: 'wait', reason: decision.reason, status, position };
    }

    const record: CapacityReservationRecord = {
        id: randomUUID(),
        label: options.label,
        cwd: process.cwd(),
        ownerPid: request.ownerPid,
        ownerStartedAt: request.ownerStartedAt,
        bytes: decision.bytes,
        workers: decision.workers,
        createdAt: now,
    };
    registry.writeReservation(record);
    registry.removeWaiter(waiter.ticket);
    registry.writeLastAdmission(now);

    return { kind: 'grant', record };
}

function createReservation(request: PreparedRequest, record: CapacityReservationRecord): MachineCapacityReservation {
    const { registry, options } = request;
    const ownedHere = record.ownerPid === process.pid;
    let released = false;
    let peakBytes = 0;
    let sampler: NodeJS.Timeout | undefined;

    if (ownedHere) {
        process.on('exit', release);
        sampler = setInterval(samplePeak, options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS);
        sampler.unref();
    }

    return { id: record.id, workers: record.workers, bytes: record.bytes, release };

    function release(): void {
        if (released) {
            return;
        }
        released = true;

        registry.removeReservation(record.id);
        if (!ownedHere) {
            return;
        }

        process.off('exit', release);
        clearInterval(sampler);
        samplePeak();
        if (peakBytes > record.bytes) {
            emitLines(request, [
                `${MACHINE_STATUS_PREFIX}${options.label} peaked at ${formatBytes(peakBytes)}, above its reservation of ` +
                    `${formatBytes(record.bytes)} (base ${formatBytes(options.memory.base)} + ${record.workers} × ` +
                    `${formatBytes(options.memory.perWorker)} per worker); raise memory.base or memory.perWorker`,
            ]);
        }
    }

    function samplePeak(): void {
        try {
            peakBytes = Math.max(peakBytes, sumProcessTreeRss(registry.readProcessTable(), process.pid));
        } catch (error) {
            // Sampling only feeds the retuning hint; a failing `ps` must not crash the run it measures.
            clearInterval(sampler);
            emitLines(request, [
                `${MACHINE_STATUS_PREFIX}${options.label}: stopped measuring peak memory (${String(error)})`,
            ]);
        }
    }
}

function describeWait(label: string, outcome: WaitOutcome, now: number): string[] {
    return [
        `${MACHINE_STATUS_PREFIX}${label} waiting for machine capacity ` +
            `(position ${outcome.position} of ${Math.max(outcome.position, outcome.status.waiters.length)}): ${outcome.reason}`,
        ...formatMachineCapacityStatus(outcome.status, now),
    ];
}

function emitLines(request: PreparedRequest, lines: string[]): void {
    const onStatus = request.options.onStatus ?? writeToStderr;
    for (const line of lines) {
        onStatus(line);
    }
}

function writeToStderr(line: string): void {
    process.stderr.write(`${line}\n`);
}

function isNonNegativeNumber(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}
