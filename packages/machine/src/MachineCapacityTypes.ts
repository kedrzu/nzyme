import type { ProcessInfo } from './readProcessTree.js';

/**
 * Where the machine-global registry lives and how the machine is read. Every field has a production
 * default; tests override them to get a private registry and deterministic readings.
 */
export interface MachineCapacityEnvironmentOptions {
    /**
     * Parent of the versioned state directories; defaults to `~/.nzyme/machine/capacity`, shared by
     * every repository of the user on this machine.
     */
    rootDir?: string;
    /** Heavy runs admitted at once; defaults to `resolveMachineSlots()`. */
    slots?: number;
    readProcessTable?: () => ProcessInfo[];
    now?: () => number;
}

/** A heavy run asking for one of the machine's slots. */
export interface MachineCapacityRequestOptions extends MachineCapacityEnvironmentOptions {
    /** Shown to other users of the machine, e.g. `e2e` or `tests`. */
    label: string;
    /**
     * Process whose lifetime bounds the reservation; defaults to the calling process. A reservation
     * owned by another process has no release hook here: it ends when that process exits.
     */
    ownerPid?: number;
    /** How long a waiting request tolerates its place in the queue not improving before it fails; defaults to 30 min. */
    stallTimeoutMs?: number;
    /** Receives `[nzyme machine]` status lines; defaults to writing them to stderr. */
    onStatus?: (line: string) => void;
    /** How often a waiting request re-checks the registry; defaults to 500 ms. */
    pollMs?: number;
    /** Minimum time between two status reports while waiting; defaults to 15 s. */
    statusIntervalMs?: number;
}

/** A granted slot. */
export interface MachineCapacityReservation {
    id: string;
    /**
     * Frees the slot; idempotent. When the caller owns the reservation it also runs on process exit.
     */
    release(): void;
}

/** A live reservation as seen by everyone on the machine. */
export interface MachineCapacityHolder {
    id: string;
    label: string;
    cwd: string;
    ownerPid: number;
    createdAt: number;
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
}

/** Read-only snapshot of the registry. */
export interface MachineCapacityStatus {
    /** Heavy runs admitted at once. */
    slots: number;
    holders: MachineCapacityHolder[];
    /** In admission order. */
    waiters: MachineCapacityWaiter[];
    /**
     * Other state versions (e.g. `v3`) with live reservations: a different nzyme shares the machine,
     * and admission is blocked until it is gone or this nzyme is updated.
     */
    otherVersions: string[];
}
