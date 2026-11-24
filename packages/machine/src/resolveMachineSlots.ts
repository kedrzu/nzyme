import { totalmem } from 'node:os';

const GiB = 1024 ** 3;
/** Physical memory per slot when `NZYME_MACHINE_SLOTS` is not set. A starting point, not a measurement. */
const BYTES_PER_SLOT = 20 * GiB;

/**
 * How many heavy runs this machine admits at once: `NZYME_MACHINE_SLOTS` when it is a positive integer,
 * otherwise one slot per 20 GiB of physical memory, at least one. Every repository on the machine has to
 * agree on it, so it comes from the user's environment, never from a caller.
 * @util
 */
export function resolveMachineSlots(
    env: Readonly<Record<string, string | undefined>> = process.env,
    totalBytes: number = totalmem(),
): number {
    const configured = env.NZYME_MACHINE_SLOTS?.trim();
    if (configured && /^\d+$/.test(configured) && Number(configured) >= 1) {
        return Number(configured);
    }

    return Math.max(1, Math.floor(totalBytes / BYTES_PER_SLOT));
}
