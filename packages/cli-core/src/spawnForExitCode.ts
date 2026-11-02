import type { StdioOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

/** Exit code a shell uses for a command it cannot find — reused when the command cannot be spawned. */
const COMMAND_NOT_FOUND = 127;

/** Options of {@link spawnForExitCode}. */
export interface SpawnForExitCodeOptions {
    executable: string;
    args: string[];
    stdio: StdioOptions;
    /** The child's environment; this process's own when omitted. */
    env?: NodeJS.ProcessEnv;
}

/** How a child spawned by {@link spawnForExitCode} ended. */
export interface SpawnForExitCodeResult {
    /** The exit code a shell would report: `128 + signal` when killed, 127 when it could not start. */
    exitCode: number;
    /** Why the child could not be spawned; reporting it is the caller's job. */
    error?: Error;
}

/**
 * Spawns a command and resolves with the exit code a shell would report for it — the command's own,
 * `128 + signal` when a signal killed it, and 127 (command not found) when it could not be spawned,
 * so a CLI that runs a command can pass its outcome through as its own exit code.
 *
 * @util
 */
export function spawnForExitCode(options: SpawnForExitCodeOptions): Promise<SpawnForExitCodeResult> {
    const { executable, args, stdio, env } = options;

    return new Promise<SpawnForExitCodeResult>(resolve => {
        const child = spawn(executable, args, { stdio, env });
        child.on('error', error => resolve({ exitCode: COMMAND_NOT_FOUND, error }));
        child.on('close', (code, signal) => resolve({ exitCode: code ?? 128 + getSignalNumber(signal) }));
    });
}

/** The number of a signal, or 0 when unknown. */
function getSignalNumber(signal: NodeJS.Signals | null): number {
    return signal ? constants.signals[signal] : 0;
}
