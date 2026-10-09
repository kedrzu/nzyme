/**
 * Tool-emitted failure markers. Language-agnostic: they cover tsc (`TSxxxx`), test runners, nx,
 * playwright and generic shell errors. Broad on purpose — on a failing run some noise beats missing
 * the real cause. Case-insensitive, like the `grep -i` it replaces.
 */
const ERROR_SIGNATURE =
    /(\berror\b|\bfail(ed|ure|ing)?\b|\bassert|\bexception\b|\bcannot\b|not found|unexpected|\bTS[0-9]{3,}\b|✗|✕|✖|✘|✱|›)/i;

/** What bun prints, and exits 0 with, when `bun run` gets a script or file it does not know. */
const BUN_USAGE_BANNER = 'Usage: bun run';

/** Inputs for {@link renderQuietRunReport}. */
export interface QuietRunReportOptions {
    /** The wrapped command line, as shown to the reader. */
    label: string;
    /** Path of the full log, as shown to the reader. */
    logPath: string;
    /** The wrapped command's exit code. */
    exitCode: number;
    /** Wall-clock duration of the run, in whole seconds. */
    seconds: number;
    /** The full combined stdout/stderr of the run. */
    log: string;
    /** Lines of trailing output to show on failure. */
    tailCount: number;
    /** Maximum number of error-signature lines to show on failure. */
    maxMatches: number;
}

/** What `quiet-run` prints and the exit code it ends with. */
export interface QuietRunReport {
    /** The exit code to end with — the wrapped command's own, except for a bun usage banner. */
    exitCode: number;
    /** Text for stdout. */
    stdout: string;
    /** Text for stderr. */
    stderr: string;
}

/**
 * Turns a finished run into the little that should reach a coding agent's context: one line on
 * success; on failure the error-looking lines, a bounded tail and the log path. Kept pure so the
 * exact output format — which agents learn to read — is pinned by tests.
 *
 * The exit code is passed through, with one exception: a bun usage banner on an otherwise
 * successful run is reported as a failure with exit code 1 (see {@link getBunUsageBanner}).
 * @__NO_SIDE_EFFECTS__
 */
export function renderQuietRunReport(options: QuietRunReportOptions): QuietRunReport {
    const { label, logPath, exitCode, seconds, log, tailCount, maxMatches } = options;
    const lineCount = countLines(log);

    if (exitCode === 0) {
        const banner = getBunUsageBanner(log);
        if (banner !== null) {
            return {
                exitCode: 1,
                stdout: '',
                stderr:
                    `✗ FAILED (bun usage banner — invalid invocation exited 0 without running anything) · ${label} · full log: ${logPath}\n` +
                    `  first output line: ${banner}\n`,
            };
        }

        return {
            exitCode: 0,
            stdout: `✓ passed · ${label} · ${lineCount} lines · ${seconds}s · full log: ${logPath}\n`,
            stderr: '',
        };
    }

    const errorLines = extractErrorLines(log, maxMatches);
    const lines = [
        `✗ FAILED (exit ${exitCode}) · ${label} · ${lineCount} lines · ${seconds}s · full log: ${logPath}`,
        '--- error-signature lines (grep) ---',
        ...(errorLines.length > 0 ? errorLines : ['(no matching error lines — read the tail / full log below)']),
        `--- last ${tailCount} lines ---`,
        ...getTailLines(log, tailCount),
        `--- full log: ${logPath} (read selectively; do not re-dump it whole) ---`,
    ];

    return { exitCode, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

/**
 * Returns the lines of a log that look like errors, prefixed with their 1-based line number
 * (`12:error TS2322: …`, as `grep -n` prints them), at most `maxMatches` of them. Counting stops at
 * the limit rather than truncating afterwards, so an empty result reliably means "no error lines at
 * all", never "too many to show".
 * @__NO_SIDE_EFFECTS__
 */
export function extractErrorLines(log: string, maxMatches: number): string[] {
    const matches: string[] = [];

    for (const [index, line] of splitLines(log).entries()) {
        if (matches.length >= maxMatches) {
            break;
        }
        if (ERROR_SIGNATURE.test(line)) {
            matches.push(`${index + 1}:${line}`);
        }
    }

    return matches;
}

/**
 * Detects bun's own usage banner, returning the banner line, or `null` when the log is not one.
 *
 * An invalid `bun … run …` invocation (e.g. a stale or renamed script name) prints bun's usage
 * banner and exits 0 — a false green with no command actually run. Narrow on purpose: only the
 * FIRST non-empty output line counts, so a later legitimate mention of `Usage: bun run` in real
 * output cannot trip it.
 * @__NO_SIDE_EFFECTS__
 */
export function getBunUsageBanner(log: string): string | null {
    for (const line of splitLines(log)) {
        if (line.trim() === '') {
            continue;
        }

        return line.startsWith(BUN_USAGE_BANNER) ? line : null;
    }

    return null;
}

/** Inputs for {@link getQuietRunLogFileName}. */
export interface QuietRunLogFileNameOptions {
    /** The command's first word, e.g. `bun` or `./scripts/build.sh`. */
    executable: string;
    /** When the run started. */
    date: Date;
    /** Id of the process running it. */
    pid: number;
}

/**
 * The log file name for a run: the command's first word made filename-safe, a local timestamp and
 * the process id — e.g. `bun-20260102-030405-1234.log`. The timestamp keeps logs in run order; the
 * pid keeps two runs started in the same second apart.
 * @__NO_SIDE_EFFECTS__
 */
export function getQuietRunLogFileName(options: QuietRunLogFileNameOptions): string {
    const { executable, date, pid } = options;
    const slug = executable.replaceAll(/[^a-zA-Z0-9._-]/g, '-');
    const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

    return `${slug}-${day}-${time}-${pid}.log`;
}

/** The last `count` lines of a log, as `tail -n` shows them. */
function getTailLines(log: string, count: number): string[] {
    const lines = splitLines(log);
    return count > 0 ? lines.slice(-count) : [];
}

/** Number of lines, counted as `wc -l` does: newline characters. */
function countLines(log: string): number {
    let count = 0;
    for (const char of log) {
        if (char === '\n') {
            count++;
        }
    }
    return count;
}

/** Splits a log into lines; the empty remainder after a final newline is not a line. */
function splitLines(log: string): string[] {
    if (log === '') {
        return [];
    }

    const lines = log.split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }
    return lines;
}

/** Zero-pads a date part to two digits. */
function pad(value: number): string {
    return String(value).padStart(2, '0');
}
