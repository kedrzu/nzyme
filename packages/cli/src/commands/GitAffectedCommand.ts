import { rm } from 'node:fs/promises';
import { constants } from 'node:os';
import path from 'node:path';

import { readAffectedConfig } from '@nzyme/affected/base/AffectedConfig.js';
import { createPatternMatcher } from '@nzyme/affected/base/createPatternMatcher.js';
import { selectAffectedSinceBase } from '@nzyme/affected/base/selectAffectedSinceBase.js';
import type { AffectedSelection } from '@nzyme/affected/base/selectAffectedFiles.js';
import { openTestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import type { TestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { Option, UsageError } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import type { SpawnForExitCodeResult } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import { getPackageDirs } from '@nzyme/project-utils/getPackageDirs.js';
import { getPackages } from '@nzyme/project-utils/getPackages.js';
import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';
import { walkProjectFiles } from '@nzyme/project-utils/importGraph/walkProjectFiles.js';
import type { AffectedBase } from '@nzyme/project-utils/resolveAffectedBase.js';
import { assert } from '@nzyme/utils/assert.js';

import { describeTestSelection } from '../affected/describeTestSelection.js';
import { recordJunitResults } from '../affected/recordJunitResults.js';
import type { JunitRecording } from '../affected/recordJunitResults.js';

/**
 * Selects the files a change can affect — the changed files plus everything importing them,
 * transitively, from one scan of the project's import graph — and prints them or runs a command on
 * them, so a test runner executes only the tests a change can break. See the ADR
 * `docs/decisions/file-level-affected-selection-by-full-import-scan.md`.
 *
 * stdout is a contract (callers parse the file list), so every diagnostic goes to stderr.
 */
export class GitAffectedCommand extends Command {
    static override paths = [['git', 'affected']];

    static override usage = Command.Usage({
        category: 'Testing',
        description: 'Select the files a change can affect, and print them or run a command on them',
        details: `
            Usage: \`nzyme git affected [--base|-b <ref>] [--per-package] <pattern…> [-- <cmd…>]\`,
            or \`nzyme git affected --suite <name> [--per-package] [--junit <file>] [<pattern…>] [-- <cmd…>]\`.
            The single tests of a traced suite are selected by \`nzyme git affected-test-list\` and
            recorded by \`nzyme git affected-record\`.

            Diffs the working tree (commits, staged, unstaged, untracked; submodules against the
            gitlink of the base) against the base, scans the import graph once and selects the
            changed files plus their transitive importers that match a pattern. A pattern without
            \`/\` matches the basename (\`*.test.ts\`), one with \`/\` the root-relative path
            (\`packages/{ui,app}/**/*.stories.tsx\`).

            Without \`--\`: prints the selected root-relative paths, one per line, to stdout. With
            \`-- <cmd…>\`: runs the command with the files appended as arguments, exiting with its
            exit code. \`--per-package\`
            runs it once per owning package, sequentially, in the package directory with paths
            relative to it, and exits with the first non-zero code; an interrupt (Ctrl+C, SIGTERM,
            SIGHUP) stops the run after the current package. No affected files: nothing
            runs, exit 0.

            Base: \`--base <ref>\` (or \`-b <ref>\`); in GitHub Actions the pull request base or
            the push \`before\`; otherwise the nearest of \`baseBranches\` (as
            \`origin/<name>\`). \`nzyme git base\` prints the base this resolves to.

            Configured by the \`nzyme.affected\` field of the root package.json, all optional:
            \`baseBranches\` (default \`["main"]\`), \`aliases\` ({ prefix, packages }[]),
            \`rewrites\` ({ from, to }[] — a changed path ending in \`from\` also changes the path
            ending in \`to\`), \`fullRunTriggers\` and \`ignore\` (globs matched against the
            root-relative path, never the basename). A changed file that a \`fullRunTriggers\` file
            imports, transitively, also runs everything.

            \`--suite <name>\` selects the tests of a suite of \`nzyme.affected.suites\` from their
            recorded variants instead: a test is skipped while one of its variants matches the
            current code; one without a variant runs (a traced suite) or is selected by the base
            diff as above (a static suite). The patterns default to the suite's, when it has them; the output, the
            command and the empty-selection rule are the same. A summary with the reasons goes to
            stderr.

            \`--junit <file>\` (with \`--suite\` and a command): after the command, reads the
            JUnit report it wrote (bun test, vitest) and records a variant of each test file whose
            testcases all passed; a failed file records nothing, so it runs again. The file is
            deleted before each run, so a run that writes no report records nothing rather than a
            stale one; with \`--per-package\` it is read after each package's run, before the next
            overwrites it — pass the command an absolute path, as it runs in the package directory.
            An unreadable report records nothing; the exit code stays the command's.
        `,
        examples: [
            ['List the tests affected by the change', "nzyme git affected '*.test.ts'"],
            ['Run the affected tests', "nzyme git affected '*.test.ts' -- bun test"],
            [
                'Run affected stories per package',
                "nzyme git affected --per-package 'packages/*/src/**/*.stories.tsx' -- bunx vitest run --project=storybook",
            ],
            [
                'Run the unit tests no variant skips, recording the passing ones',
                'nzyme git affected --suite unit --junit /tmp/junit.xml -- bun test --reporter=junit --reporter-outfile=/tmp/junit.xml',
            ],
            [
                'Run the affected stories per package, recording the passing ones',
                'nzyme git affected --suite stories --per-package --junit /tmp/junit.xml -- bunx vitest run --reporter=junit --outputFile.junit=/tmp/junit.xml',
            ],
        ],
    });

    /**
     * Everything after `git affected`, parsed by {@link parseAffectedArgs}: clipanion cannot tell the
     * patterns from the command after `--` (a rest list swallows both, and a proxy cannot sit beside one).
     */
    args = Option.Proxy({ name: 'args' });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        if (isHelpRequest(this.args)) {
            this.context.stdout.write(this.cli.usage(GitAffectedCommand, { detailed: true }));
            return 0;
        }

        const args = parseAffectedArgs(this.args);
        const root = await new GitRepository(this.cwd).git(['rev-parse', '--show-toplevel']);
        if (args.suite !== undefined) {
            return await this.runSuite(root, args, args.suite);
        }

        const config = await readAffectedConfig(root);
        const { base, changedFiles, selection, packageDirs } = await selectAffectedSinceBase({
            root,
            config,
            patterns: args.patterns,
            base: args.base,
            env: process.env,
        });

        this.context.stderr.write(`${describeRun(base, changedFiles.length, selection)}\n`);

        if (selection.files.length === 0) {
            this.context.stderr.write('no affected files\n');
            return 0;
        }

        if (!args.command) {
            this.context.stdout.write(`${selection.files.join('\n')}\n`);
            return 0;
        }

        return await this.runOnFiles({ root, command: args.command, files: selection.files, packageDirs, args });
    }

    /** `--suite`: selects the suite's tests from their recorded variants. */
    private async runSuite(root: string, args: AffectedArgs, suite: string): Promise<number> {
        const selector = await openTestSelector({ root, suite, base: args.base });
        const config = await readAffectedConfig(root);
        const suiteConfig = config.suites[suite];
        assert(suiteConfig, `openTestSelector accepted suite "${suite}".`);
        const patterns = args.patterns.length > 0 ? args.patterns : suiteConfig.patterns;
        if (patterns === undefined) {
            throw new UsageError(
                `--suite ${suite} has no patterns in nzyme.affected.suites.${suite}: pass them on the command line.`,
            );
        }
        const matchesPattern = createPatternMatcher(patterns);
        const files = (await walkProjectFiles(root)).filter(file => matchesPattern(file));
        const selection = await selector.select(files.map(file => ({ file })));
        this.context.stderr.write(`nzyme git affected --suite ${suite}: ${describeTestSelection(selection)}\n`);

        const selected = selection.run.map(test => test.unit.file);
        if (selected.length === 0) {
            this.context.stderr.write('no affected files\n');
            return 0;
        }

        if (!args.command) {
            this.context.stdout.write(`${selected.join('\n')}\n`);
            return 0;
        }

        const packageDirs = args.perPackage ? getPackageDirs(root, await getPackages(root)) : [];
        if (args.junit === undefined) {
            return await this.runOnFiles({ root, command: args.command, files: selected, packageDirs, args });
        }

        const junitFile = path.resolve(this.cwd, args.junit);
        const recordings: JunitRecording[] = [];
        const exitCode = await this.runOnFiles({
            root,
            command: args.command,
            files: selected,
            packageDirs,
            args,
            junit: {
                file: junitFile,
                onReport: async ranFiles => {
                    const recording = await this.recordFromJunit({ root, selector, junitFile, ranFiles });
                    if (recording) {
                        recordings.push(recording);
                    }
                },
            },
        });
        if (recordings.length > 0) {
            this.context.stderr.write(`${describeRecording(mergeRecordings(recordings))}\n`);
        }
        return exitCode;
    }

    /**
     * Records the outcome of each file of one run from its JUnit report. A report that cannot be read
     * records nothing and returns `undefined`.
     */
    private async recordFromJunit(options: RecordFromJunitOptions): Promise<JunitRecording | undefined> {
        try {
            return await recordJunitResults(options);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(
                `nzyme git affected: no variants recorded, cannot read the JUnit report: ${message}\n`,
            );
            return undefined;
        }
    }

    /**
     * Runs the command on `files`, once or per owning package; an interrupt stops the run after the
     * current package. With `junit`, the report is deleted before each run and handed over after it.
     */
    private async runOnFiles(options: RunOnFilesOptions): Promise<number> {
        const { root, command, files, args, junit } = options;
        const groups = args.perPackage ? groupByPackage(files, options.packageDirs) : [{ dir: '', files }];
        let exitCode = 0;
        for (const group of groups) {
            if (args.perPackage) {
                this.context.stderr.write(`nzyme git affected: ${group.dir || '.'} (${group.files.length} files)\n`);
            }
            if (junit) {
                await rm(junit.file, { force: true });
            }
            const result = await this.runCommand(command, path.join(root, group.dir), group.files);
            if (junit) {
                await junit.onReport(group.files.map(file => (group.dir === '' ? file : `${group.dir}/${file}`)));
            }
            if (exitCode === 0) {
                exitCode = result.exitCode;
            }
            if (result.signal) {
                // An interrupted run stops here: the next package must not start after Ctrl+C or a SIGTERM.
                this.context.stderr.write(`nzyme git affected: stopped by ${result.signal}\n`);
                return exitCode || 128 + constants.signals[result.signal];
            }
        }

        return exitCode;
    }

    /** Runs the command in `cwd` with `files` (relative to it) as trailing arguments. */
    private async runCommand(
        command: AffectedRunCommand,
        cwd: string,
        files: string[],
    ): Promise<SpawnForExitCodeResult> {
        const result = await spawnForExitCode({
            executable: command.executable,
            args: [...command.args, ...files],
            stdio: 'inherit',
            cwd,
        });

        if (result.error) {
            this.context.stderr.write(`nzyme git affected: ${command.executable}: ${result.error.message}\n`);
        }

        return result;
    }
}

/** The parsed arguments of `nzyme git affected`. */
interface AffectedArgs {
    base?: string;
    perPackage: boolean;
    patterns: string[];
    /** The command after `--`, when given. */
    command?: AffectedRunCommand;
    /** `--suite <name>`: select from the recorded variants of a suite of `nzyme.affected.suites`. */
    suite?: string;
    /** `--junit <file>`: the JUnit report the command writes, to record from. */
    junit?: string;
}

/** The command `nzyme git affected` runs on the selected files. */
interface AffectedRunCommand {
    executable: string;
    args: string[];
}

/** Files of one owning package, relative to its directory `dir` (root-relative; `''` is the root). */
interface AffectedFileGroup {
    dir: string;
    files: string[];
}

/** Options of `GitAffectedCommand.runOnFiles`. */
interface RunOnFilesOptions {
    root: string;
    command: AffectedRunCommand;
    /** Root-relative files to pass to the command. */
    files: string[];
    /** Root-relative package directories, for `--per-package`. */
    packageDirs: string[];
    args: AffectedArgs;
    /** `--junit`: the report each run writes, and what reads it after the run. */
    junit?: RunJunit;
}

/** The JUnit report of `GitAffectedCommand.runOnFiles`. */
interface RunJunit {
    /** Absolute path of the report; deleted before each run. */
    file: string;
    /** Called after each run (each package, with `--per-package`) with the root-relative files it ran. */
    onReport(ranFiles: string[]): Promise<void>;
}

/** Options of `GitAffectedCommand.recordFromJunit`. */
interface RecordFromJunitOptions {
    root: string;
    selector: TestSelector;
    /** Absolute path of the report. */
    junitFile: string;
    /** Root-relative test files the command ran. */
    ranFiles: string[];
}

/** Options taking a value: `--name <value>` or `--name=<value>`. */
const VALUE_OPTIONS = {
    '--base': 'base',
    '-b': 'base',
    '--suite': 'suite',
    '--junit': 'junit',
} as const satisfies Record<string, keyof AffectedArgs>;

/** `--help` / `-h` before `--` — the proxy keeps clipanion from seeing it. */
function isHelpRequest(argv: string[]): boolean {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    return own.includes('--help') || own.includes('-h');
}

/**
 * Parses `[--base <ref>|-b <ref>] [--per-package] [--suite <name> [--junit <file>]] <pattern…>
 * [-- <cmd…>]`. A value option also takes `--name=<value>`. Options may stand anywhere before `--`;
 * everything after it is the command, untouched.
 */
function parseAffectedArgs(argv: string[]): AffectedArgs {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    const result: AffectedArgs = { perPackage: false, patterns: [] };

    for (let i = 0; i < own.length; i++) {
        const token = own[i] ?? '';
        const [name, inline] = token.startsWith('--') ? splitInlineValue(token) : [token, undefined];
        if (token === '--per-package') {
            result.perPackage = true;
        } else if (isValueOption(name)) {
            const value = inline ?? own[++i];
            if (value === undefined || value === '') {
                throw new UsageError(
                    name === '--base' || name === '-b' ? `${name} needs a ref.` : `${name} needs a value.`,
                );
            }
            result[VALUE_OPTIONS[name]] = value;
        } else if (token.startsWith('-')) {
            throw new UsageError(`Unknown option ${token}. Put the command to run after \`--\`.`);
        } else {
            result.patterns.push(token);
        }
    }

    if (separator !== -1) {
        const [executable, ...args] = argv.slice(separator + 1);
        if (executable === undefined) {
            throw new UsageError('Pass the command to run after `--`.');
        }
        result.command = { executable, args };
    }

    validateAffectedArgs(result);
    return result;
}

/**
 * Patterns are required without `--suite` (a suite defaults to its own); `--junit` needs `--suite`,
 * and it and `--per-package` need a command.
 */
function validateAffectedArgs(args: AffectedArgs): void {
    if (args.junit !== undefined && args.suite === undefined) {
        throw new UsageError('--junit needs --suite <name>.');
    }
    if (args.suite === undefined && args.patterns.length === 0) {
        throw new UsageError('Pass at least one pattern, e.g. `nzyme git affected "*.test.ts"`.');
    }
    if (args.perPackage && !args.command) {
        throw new UsageError('--per-package needs a command to run after `--`.');
    }
    if (args.junit !== undefined && !args.command) {
        throw new UsageError('--junit needs the command that writes the report after `--`.');
    }
}

/** `--name=value` → `['--name', 'value']`; a token without `=` → `[token, undefined]`. */
function splitInlineValue(token: string): [string, string | undefined] {
    const index = token.indexOf('=');
    return index === -1 ? [token, undefined] : [token.slice(0, index), token.slice(index + 1)];
}

function isValueOption(name: string): name is keyof typeof VALUE_OPTIONS {
    return Object.hasOwn(VALUE_OPTIONS, name);
}

/** `nzyme git affected: recorded 5 · 1 failed · 1 not recorded (a.test.ts: edited b.ts)`. */
function describeRecording(recording: JunitRecording): string {
    const parts = [`nzyme git affected: recorded ${recording.recorded.length}`];
    if (recording.failed.length > 0) {
        parts.push(`${recording.failed.length} failed`);
    }
    if (recording.refused.length > 0) {
        const refusals = recording.refused.map(({ file, reason }) =>
            reason.kind === 'not-passed' ? file : `${file}: ${reason.kind} ${reason.file}`,
        );
        parts.push(`${recording.refused.length} not recorded (${refusals.join(', ')})`);
    }
    if (recording.unreported.length > 0) {
        parts.push(
            `${recording.unreported.length} not passed in full in the report (a testcase skipped, or not reported)`,
        );
    }
    return parts.join(' · ');
}

/** The recordings of several runs (one per package) as one. */
function mergeRecordings(recordings: readonly JunitRecording[]): JunitRecording {
    const merged: JunitRecording = { recorded: [], refused: [], failed: [], unreported: [] };
    for (const recording of recordings) {
        merged.recorded.push(...recording.recorded);
        merged.refused.push(...recording.refused);
        merged.failed.push(...recording.failed);
        merged.unreported.push(...recording.unreported);
    }
    return merged;
}

/** Groups root-relative files by owning package, with paths relative to it; groups in directory order. */
function groupByPackage(files: string[], packageDirs: string[]): AffectedFileGroup[] {
    const groups = new Map<string, string[]>();
    for (const file of files) {
        const dir = findOwningPackageDir(file, packageDirs);
        const relative = dir === '' ? file : file.slice(dir.length + 1);
        const group = groups.get(dir);
        if (group) {
            group.push(relative);
        } else {
            groups.set(dir, [relative]);
        }
    }

    return [...groups.keys()].toSorted().map(dir => ({ dir, files: groups.get(dir) ?? [] }));
}

/** The one diagnostic line of a run: base, changed file count, full-run reason and selection size. */
function describeRun(base: AffectedBase, changedCount: number, selection: AffectedSelection): string {
    const parts = [
        `nzyme git affected: base ${base.ref} (${base.source}, merge-base ${base.mergeBase.slice(0, 10)})`,
        `${changedCount} changed files`,
    ];
    if (selection.fullRun) {
        const { file, trigger, via } = selection.fullRun;
        parts.push(
            via
                ? `full run: ${file} is imported by ${via}, which matches trigger "${trigger}"`
                : `full run: ${file} matches trigger "${trigger}"`,
        );
    }
    parts.push(`${selection.files.length} selected`);
    return parts.join(' · ');
}
