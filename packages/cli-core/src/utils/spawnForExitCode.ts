import type { StdioOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

/** Exit code a shell uses for a command it cannot find — reused when the command cannot be spawned. */
const COMMAND_NOT_FOUND = 127;

/**
 * Signals a process manager, an IDE or `kill` sends to this process alone, passed on to the child.
 * SIGINT is not among them: Ctrl+C already reaches the child through the terminal's process group, and a
 * second copy makes many tools force-quit and skip their cleanup — so it is only kept from ending this
 * process before the child, as a shell does.
 */
const FORWARDED_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGHUP'];

/** Options of {@link spawnForExitCode}. */
export interface SpawnForExitCodeOptions {
    executable: string;
    args: string[];
    stdio: StdioOptions;
    /** The child's environment; this process's own when omitted. */
    env?: NodeJS.ProcessEnv;
    /** The child's working directory; this process's own when omitted. */
    cwd?: string;
}

/** How a child spawned by {@link spawnForExitCode} ended. */
export interface SpawnForExitCodeResult {
    /** The exit code a shell would report: `128 + signal` when killed, 127 when it could not start. */
    exitCode: number;
    /** Why the child could not be spawned; reporting it is the caller's job. */
    error?: Error;
    /**
     * The signal this process received while the child ran — set when the run was interrupted (Ctrl+C,
     * a stopping process manager), so a caller running several commands stops instead of starting the next.
     */
    signal?: NodeJS.Signals;
}

/**
 * Spawns a command and resolves with the exit code a shell would report for it — the command's own,
 * `128 + signal` when a signal killed it, and 127 (command not found) when it could not be spawned,
 * so a CLI that runs a command can pass its outcome through as its own exit code.
 *
 * While the child runs, this process outlives it: SIGTERM and SIGHUP are forwarded to the child and
 * SIGINT is ignored, so a stopped wrapper never orphans its command and the exit code stays the child's.
 * The signal received is reported back, so a caller running commands in turn can stop after this one.
 *
 * @util
 */
export function spawnForExitCode(options: SpawnForExitCodeOptions): Promise<SpawnForExitCodeResult> {
    const { executable, args, stdio, env, cwd } = options;

    return new Promise<SpawnForExitCodeResult>(resolve => {
        const child = spawn(executable, args, { stdio, env, cwd });
        let received: NodeJS.Signals | undefined;
        process.on('SIGINT', record);
        for (const signal of FORWARDED_SIGNALS) {
            process.on(signal, forward);
        }

        child.on('error', error => settle({ exitCode: COMMAND_NOT_FOUND, error }));
        child.on('close', (code, signal) => settle({ exitCode: code ?? 128 + getSignalNumber(signal) }));

        function record(signal: NodeJS.Signals) {
            received ??= signal;
        }

        function forward(signal: NodeJS.Signals) {
            record(signal);
            child.kill(signal);
        }

        function settle(result: SpawnForExitCodeResult) {
            process.off('SIGINT', record);
            for (const signal of FORWARDED_SIGNALS) {
                process.off(signal, forward);
            }
            resolve(received ? { ...result, signal: received } : result);
        }
    });
}

/** The number of a signal, or 0 when unknown. */
function getSignalNumber(signal: NodeJS.Signals | null): number {
    return signal ? constants.signals[signal] : 0;
}
