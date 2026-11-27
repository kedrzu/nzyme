import { formatDurationMs } from '@nzyme/utils/formatDurationMs.js';

import type { MachineCapacityStatus } from './MachineCapacityTypes.js';

/** Prefix of every line the registry prints, so wrappers can pass those lines through. */
export const MACHINE_STATUS_PREFIX = '[nzyme machine] ';

/**
 * Renders a registry snapshot as `[nzyme machine]`-prefixed lines: the slots, their holders, the
 * queue, and other nzyme versions sharing the machine.
 * @__NO_SIDE_EFFECTS__
 */
export function formatMachineCapacityStatus(status: MachineCapacityStatus, now: number): string[] {
    const lines = [
        `slots: ${status.holders.length} of ${status.slots} taken (NZYME_MACHINE_SLOTS overrides the count)`,
    ];

    for (const holder of status.holders) {
        lines.push(
            `  ${holder.label} pid ${holder.ownerPid} in ${holder.cwd}: for ${formatDurationMs(now - holder.createdAt)}`,
        );
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
