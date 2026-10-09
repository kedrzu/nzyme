import { spawn } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { constants } from 'node:os';
import path from 'node:path';

import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import { Command } from '../Command.js';
import { Option } from '../index.js';
import { getQuietRunLogFileName, renderQuietRunReport } from '../quietRun/quietRunReport.js';

/** Default lines of trailing output shown on failure. */
const DEFAULT_TAIL = 30;

/** Default maximum of error-signature lines shown on failure. */
const DEFAULT_MATCHES = 40;

/** Exit code a shell uses for a command it cannot find — reused when the command cannot be spawned. */
const COMMAND_NOT_FOUND = 127;

/**
 * Runs a command while keeping its full output OUT of a coding agent's context.
 *
 * Build, test, e2e and codegen commands dump hundreds to thousands of lines into the agent's
 * context, where they sit and get re-read on every later turn — the single biggest driver of
 * cache/token spend. On a green run the agent needs one line ("it passed"); on a red run it needs
 * the failing lines and a count, not the whole log. So the full output goes to a gitignored log file
 * and only a summary is printed. The log stays on disk for the rare case a deeper look is needed —
 * read it selectively (grep, a line range) rather than dumping it back into context.
 */
export class QuietRunCommand extends Command {
    static override paths = [['quiet-run']];

    static override usage = Command.Usage({
        category: 'Agents',
        description: 'Run a command with its output sent to a log file, printing only a summary',
        details: `
            Runs the command with its combined stdout/stderr written to a log file in
            \`<project root>/.context/cmd-logs/\`. On success prints one line (command, line
            count, duration, log path). On failure prints the error-looking lines, the last
            lines of output and the log path. The exit code is the command's own — except that
            bun's "Usage: bun run" banner (an invalid invocation that exits 0 without running
            anything) is reported as a failure with exit code 1.

            Tunables (environment variables): QUIET_RUN_LOGDIR — where logs go (default
            \`<project root>/.context/cmd-logs\`); QUIET_RUN_TAIL — lines of trailing output shown
            on failure (default ${DEFAULT_TAIL}); QUIET_RUN_MATCHES — maximum error-signature lines
            shown on failure (default ${DEFAULT_MATCHES}).
        `,
        examples: [
            ['Build quietly', 'nzyme quiet-run bun run build'],
            ['Type-check quietly', 'nzyme quiet-run tsgo --build'],
        ],
    });

    command = Option.Proxy({ name: 'command', required: 1 });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const [executable, ...args] = this.command;
        if (!executable) {
            this.context.stderr.write('usage: nzyme quiet-run <command> [args...]\n');
            return 2;
        }

        const logDir = this.getLogDir();
        await mkdir(logDir, { recursive: true });
        const logPath = path.join(logDir, getQuietRunLogFileName({ executable, date: new Date(), pid: process.pid }));

        const startedAt = Date.now();
        const exitCode = await runToLog({ executable, args, logPath });
        const seconds = Math.floor((Date.now() - startedAt) / 1000);

        const report = renderQuietRunReport({
            label: this.command.join(' '),
            logPath: this.toDisplayPath(logPath),
            exitCode,
            seconds,
            log: await readFile(logPath, 'utf8'),
            tailCount: readCount('QUIET_RUN_TAIL', DEFAULT_TAIL),
            maxMatches: readCount('QUIET_RUN_MATCHES', DEFAULT_MATCHES),
        });

        this.context.stdout.write(report.stdout);
        this.context.stderr.write(report.stderr);
        return report.exitCode;
    }

    /** `QUIET_RUN_LOGDIR` (relative to the cwd) when set, else `.context/cmd-logs` under the project root. */
    private getLogDir(): string {
        const configured = process.env.QUIET_RUN_LOGDIR;
        if (configured) {
            return path.resolve(this.cwd, configured);
        }

        return path.join(this.getProjectRoot(), '.context', 'cmd-logs');
    }

    /** The project root, or the cwd outside any project — a command run anywhere still gets its log. */
    private getProjectRoot(): string {
        try {
            return getProjectRoot(this.cwd);
        } catch {
            return this.cwd;
        }
    }

    /** The log path relative to the cwd when it lies beneath it (shorter to read), else absolute. */
    private toDisplayPath(logPath: string): string {
        const relative = path.relative(this.cwd, logPath);
        return relative.startsWith('..') || path.isAbsolute(relative) ? logPath : relative;
    }
}

/** Inputs for {@link runToLog}. */
interface RunToLogOptions {
    executable: string;
    args: string[];
    logPath: string;
}

/**
 * Runs the command with stdout and stderr both going to the log file — the same file descriptor, so
 * their lines interleave in the order they were written, as `>log 2>&1` does. stdin stays attached,
 * so an interactive prompt still works. Resolves with the exit code: `128 + signal` for a command
 * killed by a signal and {@link COMMAND_NOT_FOUND} for one that could not be spawned, as a shell
 * reports them.
 */
async function runToLog(options: RunToLogOptions): Promise<number> {
    const { executable, args, logPath } = options;
    const log = await open(logPath, 'w');

    try {
        const outcome = await new Promise<{ code: number } | { error: Error }>(resolve => {
            const child = spawn(executable, args, { stdio: ['inherit', log.fd, log.fd] });
            child.on('error', error => resolve({ error }));
            child.on('close', (code, signal) => resolve({ code: code ?? 128 + getSignalNumber(signal) }));
        });

        if ('error' in outcome) {
            await log.write(`quiet-run: ${executable}: ${outcome.error.message}\n`);
            return COMMAND_NOT_FOUND;
        }

        return outcome.code;
    } finally {
        await log.close();
    }
}

/** The number of a signal, or 0 when unknown. */
function getSignalNumber(signal: NodeJS.Signals | null): number {
    return signal ? constants.signals[signal] : 0;
}

/** Reads a non-negative integer tunable from the environment, falling back to its default. */
function readCount(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }

    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}
