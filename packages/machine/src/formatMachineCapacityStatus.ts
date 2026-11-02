import { formatDurationMs } from '@nzyme/utils/formatDurationMs.js';

import { formatBytes } from './formatBytes.js';
import type { MachineCapacityStatus } from './MachineCapacityTypes.js';

/** Prefix of every line the capacity registry prints, so wrappers can pass those lines through. */
export const MACHINE_STATUS_PREFIX = '[nzyme machine] ';

/**
 * Renders a capacity snapshot as `[nzyme machine]`-prefixed lines: memory, CPU, holders with reserved
 * versus current memory, the queue, and other nzyme versions sharing the machine.
 * @__NO_SIDE_EFFECTS__
 */
export function formatMachineCapacityStatus(status: MachineCapacityStatus, now: number): string[] {
    const lines = [
        `memory: ${formatBytes(status.freeBytes)} free = ${formatBytes(status.availableBytes)} available − ` +
            `${formatBytes(status.unmetBytes)} reserved but not yet used − ${formatBytes(status.reserveBytes)} kept free ` +
            `(${formatBytes(status.totalBytes)} total)`,
        `cpu: load ${status.cpu.load1m.toFixed(1)} on ${status.cpu.cores} cores ` +
            `(admits below ${(status.cpuThreshold * status.cpu.cores).toFixed(1)})`,
    ];

    if (status.holders.length === 0) {
        lines.push('holders: none');
    } else {
        lines.push(`holders (${status.holders.length}):`);
        for (const holder of status.holders) {
            lines.push(
                `  ${holder.label} pid ${holder.ownerPid} in ${holder.cwd}: reserved ${formatBytes(holder.bytes)} ` +
                    `(${holder.workers} workers), using ${formatBytes(holder.currentRssBytes)}, ` +
                    `for ${formatDurationMs(now - holder.createdAt)}`,
            );
        }
    }

    if (status.waiters.length > 0) {
        lines.push(`queue (${status.waiters.length}):`);
        for (const [index, waiter] of status.waiters.entries()) {
            lines.push(
                `  ${index + 1}. ${waiter.label} pid ${waiter.pid} in ${waiter.cwd}: ` +
                    `waiting ${formatDurationMs(now - waiter.waitingSince)}`,
            );
        }
    }

    if (status.otherVersions.length > 0) {
        lines.push(
            `another nzyme version holds reservations on this machine (${status.otherVersions.join(', ')}); ` +
                'update nzyme in this repository so both see each other',
        );
    }

    return lines.map(line => MACHINE_STATUS_PREFIX + line);
}
