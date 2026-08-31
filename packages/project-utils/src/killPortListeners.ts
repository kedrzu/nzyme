import { execa } from 'execa';

import { waitFor } from '@nzyme/utils/waitFor.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { lsofListenArgs } from './lsofListenArgs.js';

/** A process found listening on a port. */
export interface PortProcess {
    /** Process id of the listener. */
    pid: number;
    /** Best-effort process name (`ps -o comm=`); `undefined` if it could not be resolved. */
    name: string | undefined;
}

/** Outcome of inspecting (and optionally freeing) a single port. */
export interface PortKillResult {
    /** The inspected port. */
    port: number;
    /** Listeners found on the port (after excluding this process and its parent shell). */
    processes: PortProcess[];
    /** Whether the listeners were signalled to terminate (always `false` in dry-run). */
    killed: boolean;
    /** Listener PIDs that could not be signalled because the current user lacks permission (EPERM). */
    permissionDenied: number[];
}

/** Options for {@link killPortListeners}. */
export interface KillPortListenersOptions {
    /** Ports to free. */
    ports: number[];
    /** When `true`, only report what would be killed without sending any signal. */
    dryRun?: boolean;
}

/** How long to wait for a `SIGTERM`ed process to release a port before escalating to `SIGKILL`. */
const SIGKILL_GRACE_MS = 2000;

/** Outcome of signalling a PID. */
type SignalResult =
    /** The current user is not allowed to signal it, e.g. owned by another user (`EPERM`). */
    | 'denied'
    /** No such process — it had already exited (`ESRCH`). */
    | 'gone'
    /** The signal was delivered. */
    | 'sent';

/**
 * Find every process listening on the given ports and terminate it.
 *
 * Sends `SIGTERM` first and only escalates to `SIGKILL` if the port is still held after a short grace
 * period, so dev servers get a chance to shut down cleanly. The current process and its parent shell
 * are never signalled. Safe to call for ports that are free (they are reported with no processes), and
 * idempotent — a second call is a no-op once the ports are released.
 */
export function killPortListeners(options: KillPortListenersOptions): Promise<PortKillResult[]> {
    // Ports are independent — free them concurrently so a slow SIGTERM grace on one port doesn't
    // serialize behind the others (worst case drops from ~grace × ports to ~grace overall).
    const dryRun = options.dryRun ?? false;
    return Promise.all(options.ports.map(port => killListenersOnPort(port, dryRun)));
}

async function killListenersOnPort(port: number, dryRun: boolean): Promise<PortKillResult> {
    const pids = await findListeners(port);
    const processes = await Promise.all(pids.map(async pid => ({ pid, name: await resolveProcessName(pid) })));

    if (processes.length === 0 || dryRun) {
        return { port, processes, killed: false, permissionDenied: [] };
    }

    const permissionDenied = new Set<number>();
    for (const { pid } of processes) {
        if (signal(pid, 'SIGTERM') === 'denied') {
            permissionDenied.add(pid);
        }
    }

    if (!(await waitForPortFree(port, SIGKILL_GRACE_MS))) {
        // Only escalate the PIDs we originally targeted: a different process may have grabbed the
        // just-freed port during the grace window, and SIGKILLing it would be both surprising and
        // absent from the reported result.
        const original = new Set(processes.map(p => p.pid));
        for (const pid of await findListeners(port)) {
            if (original.has(pid) && signal(pid, 'SIGKILL') === 'denied') {
                permissionDenied.add(pid);
            }
        }
    }

    return { port, processes, killed: true, permissionDenied: [...permissionDenied] };
}

/** Return the PIDs listening on a TCP port, excluding this process and its parent shell. */
async function findListeners(port: number): Promise<number[]> {
    // lsof exits 1 with no output when nothing is listening, hence reject:false.
    const { stdout } = await execa('lsof', lsofListenArgs(port), { reject: false });

    const own = new Set([process.pid, process.ppid]);
    return [...new Set(stdout.split('\n'))]
        .map(line => Number(line.trim()))
        .filter(pid => Number.isInteger(pid) && pid > 0 && !own.has(pid));
}

/** Best-effort process name for display; `undefined` if the process is gone or `ps` fails. */
async function resolveProcessName(pid: number): Promise<string | undefined> {
    const { stdout, exitCode } = await execa('ps', ['-p', String(pid), '-o', 'comm='], { reject: false });
    const name = stdout.trim();
    return exitCode === 0 && name ? name : undefined;
}

/**
 * Send a signal to a PID, tolerating the two non-fatal cases so one process never aborts the batch:
 * the process already exited (`ESRCH`) or we lack permission to signal it (`EPERM`).
 */
function signal(pid: number, sig: NodeJS.Signals): SignalResult {
    try {
        process.kill(pid, sig);
        return 'sent';
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ESRCH') {
            return 'gone';
        }
        if (code === 'EPERM') {
            return 'denied';
        }
        throw err;
    }
}

/** Poll until the port has no listeners or the timeout elapses; returns whether it became free. */
function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
    return withTimeout({
        timeoutMs,
        operation: async abortSignal => {
            while (!abortSignal.aborted) {
                if ((await findListeners(port)).length === 0) {
                    return true;
                }
                await waitFor(100);
            }

            // Unreachable in practice: the deadline settles the call before the loop observes the abort.
            return false;
        },
        // One last look — the port may have been freed during the final poll interval.
        onTimeout: async () => (await findListeners(port)).length === 0,
    });
}
