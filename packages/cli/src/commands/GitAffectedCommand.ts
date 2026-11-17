import { readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:os';
import path from 'node:path';

import { readAffectedConfig } from '@nzyme/affected/base/AffectedConfig.js';
import { createPatternMatcher } from '@nzyme/affected/base/createPatternMatcher.js';
import { selectAffectedSinceBase } from '@nzyme/affected/base/selectAffectedSinceBase.js';
import type { AffectedSelection } from '@nzyme/affected/base/selectAffectedFiles.js';
import { formatPlaywrightTestList, readPlaywrightTestList } from '@nzyme/affected/playwright/playwrightTestList.js';
import { readTracedTestResults } from '@nzyme/affected/playwright/TracedTestResult.js';
import { openTestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import type { TestSelector, TestSelectorSnapshot } from '@nzyme/affected/selector/openTestSelector.js';
import type { TestSelection } from '@nzyme/affected/selector/TestSelection.js';
import { getTestUnitKey } from '@nzyme/affected/store/VariantStore.js';
import { Option, UsageError } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import type { SpawnForExitCodeResult } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import { getPackages } from '@nzyme/project-utils/getPackages.js';
import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';
import { walkProjectFiles } from '@nzyme/project-utils/importGraph/walkProjectFiles.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';
import type { AffectedBase } from '@nzyme/project-utils/resolveAffectedBase.js';
import { assert } from '@nzyme/utils/assert.js';

import { describeTestSelection } from '../affected/describeTestSelection.js';
import { recordJunitResults } from '../affected/recordJunitResults.js';
import type { JunitRecording } from '../affected/recordJunitResults.js';
import { recordTracedResults } from '../affected/recordTracedResults.js';
import type { TracedRecording } from '../affected/recordTracedResults.js';

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
            \`nzyme git affected --suite <name> [--per-package] [--junit <file>] [--full] [<pattern…>] [-- <cmd…>]\`,
            \`nzyme git affected --suite <name> --units <file> --test-list-out <file> [--snapshot <file>]\`
            or \`nzyme git affected --suite <name> --record <file> --snapshot <file> [--full]\`.

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
            diff as above (a static suite). The patterns default to the suite's; the output, the
            command and the empty-selection rule are the same. A summary with the reasons goes to
            stderr. \`--full\` runs every test of the suite, still selecting, for the audit below.

            \`--junit <file>\` (with \`--suite\` and a command): after the command, reads the
            JUnit report it wrote (bun test, vitest) and records a variant of each test file whose
            testcases all passed; a file with a failure has its matching variants invalidated, and
            one the selection skipped yet failed (under \`--full\`) is reported as a hole in what
            the selection sees. The file is deleted before each run, so a run that writes no report
            records nothing rather than a stale one; with \`--per-package\` it is read after each
            package's run, before the next overwrites it — pass the command an absolute path, as
            it runs in the package directory. An unreadable report records nothing; the exit code
            stays the command's.

            \`--units <file> --test-list-out <file>\` (with \`--suite\`; no patterns, no command):
            selects single tests from the output of \`playwright test --list --reporter=json\` and
            writes them as a Playwright \`--test-list\` file. Exits 0; the summary goes to stderr.
            \`--snapshot <file>\` also writes the selection and the state of the code it saw, for
            \`--record\`.

            \`--record <file> --snapshot <file>\` (with \`--suite\`; no patterns, no command):
            after a traced run, records the results file its reporter wrote (\`@nzyme/trace\`): a
            passed test with a complete trace gets a variant, unless a file it depends on was edited
            since the selection the snapshot holds; a failed test has its matching variants
            invalidated; an incomplete trace records nothing and is counted by reason. \`--full\`
            also reports each failed test the selection had skipped. Always exits 0.
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
            [
                'Select single e2e tests for Playwright',
                'nzyme git affected --suite e2e --units units.json --test-list-out selected.txt --snapshot snapshot.json',
            ],
            [
                'Record the results of the traced e2e run',
                'nzyme git affected --suite e2e --record results.ndjson --snapshot snapshot.json',
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
        if (args.record !== undefined) {
            assert(args.snapshot !== undefined, '--record comes with --snapshot.');
            await this.recordTracedRun({ root, suite, results: args.record, snapshot: args.snapshot, full: args.full });
            return 0;
        }

        const selector = await openTestSelector({ root, suite, base: args.base });
        if (args.units !== undefined) {
            assert(args.testListOut !== undefined, '--units comes with --test-list-out.');
            return await this.writeSelectedTestList({
                root,
                selector,
                suite,
                units: args.units,
                out: args.testListOut,
                snapshot: args.snapshot,
            });
        }

        const config = await readAffectedConfig(root);
        const suiteConfig = config.suites[suite];
        assert(suiteConfig, `openTestSelector accepted suite "${suite}".`);
        const matchesPattern = createPatternMatcher(args.patterns.length > 0 ? args.patterns : suiteConfig.patterns);
        const files = (await walkProjectFiles(root)).filter(file => matchesPattern(file));
        const selection = await selector.select(files.map(file => ({ file })));
        this.context.stderr.write(`nzyme git affected --suite ${suite}: ${describeTestSelection(selection)}\n`);

        const selected = args.full ? files : selection.run.map(test => test.unit.file);
        if (args.full) {
            this.context.stderr.write(`nzyme git affected: --full runs all ${files.length} files\n`);
        }
        if (selected.length === 0) {
            this.context.stderr.write('no affected files\n');
            return 0;
        }

        if (!args.command) {
            this.context.stdout.write(`${selected.join('\n')}\n`);
            return 0;
        }

        const packageDirs = args.perPackage ? await getPackageDirs(root) : [];
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
            this.reportRecording(mergeRecordings(recordings), selector, selection);
        }
        return exitCode;
    }

    /**
     * `--units`: selects single tests listed by `playwright test --list --reporter=json` and writes
     * them as a `--test-list` file. Exits 0 whatever is selected; the caller reads the file.
     */
    private async writeSelectedTestList(options: WriteSelectedTestListOptions): Promise<number> {
        const tests = await readPlaywrightTestList(path.resolve(this.cwd, options.units), options.root);
        const selection = await options.selector.select(tests.map(test => test.unit));
        const run = new Set(selection.run.map(test => getTestUnitKey(test.unit)));

        await writeFile(
            path.resolve(this.cwd, options.out),
            formatPlaywrightTestList(tests.filter(test => run.has(getTestUnitKey(test.unit)))),
        );
        if (options.snapshot !== undefined) {
            const snapshot: SelectionSnapshot = {
                suite: options.suite,
                selector: options.selector.snapshot(),
                selection,
            };
            await writeFile(path.resolve(this.cwd, options.snapshot), JSON.stringify(snapshot));
        }
        this.context.stderr.write(`nzyme git affected --suite ${options.suite}: ${describeTestSelection(selection)}\n`);
        return 0;
    }

    /**
     * `--record`: records the results file of a traced run against the selection snapshot taken
     * before it, then (`--full`) reports the failed tests the selection had skipped. A problem only
     * costs the recording: it is reported, never failing the run.
     */
    private async recordTracedRun(options: RecordTracedRunOptions): Promise<void> {
        const { stderr } = this.context;
        let snapshot: SelectionSnapshot;
        try {
            // Written by `--units … --snapshot` of this command.
            snapshot = JSON.parse(
                await readFile(path.resolve(this.cwd, options.snapshot), 'utf8'),
            ) as SelectionSnapshot;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stderr.write(`nzyme git affected: no variants recorded, cannot read the snapshot: ${message}\n`);
            return;
        }
        if (snapshot.suite !== options.suite) {
            stderr.write(
                `nzyme git affected: no variants recorded, the snapshot is of suite "${snapshot.suite}", not "${options.suite}"\n`,
            );
            return;
        }

        const selector = await openTestSelector({
            root: options.root,
            suite: options.suite,
            snapshot: snapshot.selector,
        });
        const results = await readTracedTestResults(path.resolve(this.cwd, options.results));
        const recording = await recordTracedResults(selector, results);
        stderr.write(`${describeTracedRecording(recording)}\n`);
        if (!options.full) {
            return;
        }
        for (const { unit, reason } of selector.audit(recording.failed, snapshot.selection)) {
            stderr.write(
                `nzyme git affected: tracing gap: ${[unit.file, ...(unit.title ?? [])].join(' › ')} failed, ` +
                    `yet the selection skipped it (${reason.kind}) — its variants were invalidated\n`,
            );
        }
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
     * Prints what was recorded, then the failed files the selection had skipped (only an explicit
     * `--full` run executes those): a dependency neither a variant nor the import graph saw. Their
     * matching variants are already invalidated, as are those of every failed file.
     */
    private reportRecording(recording: JunitRecording, selector: TestSelector, selection: TestSelection): void {
        const { stderr } = this.context;
        stderr.write(`${describeRecording(recording)}\n`);
        for (const { unit, reason } of selector.audit(recording.failed, selection)) {
            stderr.write(
                `nzyme git affected: ${unit.file} failed, yet the selection skipped it (${reason.kind}) — ` +
                    'a dependency it does not see; its variants were invalidated\n',
            );
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
    /** `--units <file>`: the `playwright test --list --reporter=json` output to select single tests from. */
    units?: string;
    /** `--test-list-out <file>`: where to write the selected tests as a Playwright `--test-list`. */
    testListOut?: string;
    /** `--snapshot <file>`: the selection and the code state it saw, written by `--units`, read by `--record`. */
    snapshot?: string;
    /** `--record <file>`: the results file of a traced run, to record. */
    record?: string;
    /** `--full`: run every test of the suite; the selection is still made, for the audit. */
    full: boolean;
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

/** Options of `GitAffectedCommand.writeSelectedTestList`. */
interface WriteSelectedTestListOptions {
    root: string;
    selector: TestSelector;
    suite: string;
    /** The `--units` file. */
    units: string;
    /** The `--test-list-out` file. */
    out: string;
    /** The `--snapshot` file, when given. */
    snapshot?: string;
}

/** Options of `GitAffectedCommand.recordTracedRun`. */
interface RecordTracedRunOptions {
    root: string;
    suite: string;
    /** The `--record` file. */
    results: string;
    /** The `--snapshot` file. */
    snapshot: string;
    full: boolean;
}

/** The `--snapshot` file: what the selection before a traced run saw, for recording after it. */
interface SelectionSnapshot {
    suite: string;
    selector: TestSelectorSnapshot;
    /** The selection made, for the audit of a full run. */
    selection: TestSelection;
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
    '--units': 'units',
    '--test-list-out': 'testListOut',
    '--snapshot': 'snapshot',
    '--record': 'record',
} as const satisfies Record<string, keyof AffectedArgs>;

/** `--help` / `-h` before `--` — the proxy keeps clipanion from seeing it. */
function isHelpRequest(argv: string[]): boolean {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    return own.includes('--help') || own.includes('-h');
}

/**
 * Parses `[--base <ref>|-b <ref>] [--per-package] [--suite <name> [--junit <file>] [--full] | --suite
 * <name> --units <file> --test-list-out <file> [--snapshot <file>] | --suite <name> --record <file>
 * --snapshot <file> [--full]] <pattern…> [-- <cmd…>]`. A value option also takes
 * `--name=<value>`. Options may stand anywhere before `--`; everything after it is the command, untouched.
 */
function parseAffectedArgs(argv: string[]): AffectedArgs {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    const result: AffectedArgs = { perPackage: false, patterns: [], full: false };

    for (let i = 0; i < own.length; i++) {
        const token = own[i] ?? '';
        const [name, inline] = token.startsWith('--') ? splitInlineValue(token) : [token, undefined];
        if (token === '--per-package') {
            result.perPackage = true;
        } else if (token === '--full') {
            result.full = true;
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

    if (result.suite === undefined) {
        validatePlainArgs(result);
    } else if (result.record !== undefined) {
        validateRecordArgs(result);
    } else if (result.units === undefined) {
        validateSuiteFileArgs(result);
    } else {
        validateSuiteTestArgs(result);
    }

    return result;
}

/** Without `--suite`: patterns are required, and the suite options are refused. */
function validatePlainArgs(args: AffectedArgs): void {
    for (const [option, set] of [
        ['--junit', args.junit !== undefined],
        ['--units', args.units !== undefined],
        ['--test-list-out', args.testListOut !== undefined],
        ['--snapshot', args.snapshot !== undefined],
        ['--record', args.record !== undefined],
        ['--full', args.full],
    ] as const) {
        if (set) {
            throw new UsageError(`${option} needs --suite <name>.`);
        }
    }
    if (args.patterns.length === 0) {
        throw new UsageError('Pass at least one pattern, e.g. `nzyme git affected "*.test.ts"`.');
    }
    if (args.perPackage && !args.command) {
        throw new UsageError('--per-package needs a command to run after `--`.');
    }
}

/** `--suite` over test files: the patterns default to the suite's. */
function validateSuiteFileArgs(args: AffectedArgs): void {
    if (args.testListOut !== undefined) {
        throw new UsageError('--test-list-out needs --units <file>.');
    }
    if (args.snapshot !== undefined) {
        throw new UsageError('--snapshot needs --units <file> or --record <file>.');
    }
    if (args.perPackage && !args.command) {
        throw new UsageError('--per-package needs a command to run after `--`.');
    }
    if (args.junit !== undefined && !args.command) {
        throw new UsageError('--junit needs the command that writes the report after `--`.');
    }
}

/** `--suite` over single tests: `--units` in, `--test-list-out` out, nothing else. */
function validateSuiteTestArgs(args: AffectedArgs): void {
    if (args.testListOut === undefined) {
        throw new UsageError('--units needs --test-list-out <file>.');
    }
    if (args.command || args.patterns.length > 0 || args.perPackage || args.junit !== undefined || args.full) {
        throw new UsageError(
            '--units takes no patterns, command, --per-package, --junit or --full: it only writes the selected tests.',
        );
    }
}

/** `--record` of a traced run: `--snapshot` in, `--full` optionally, nothing else. */
function validateRecordArgs(args: AffectedArgs): void {
    if (args.snapshot === undefined) {
        throw new UsageError('--record needs --snapshot <file>, written by the --units selection before the run.');
    }
    if (
        args.command ||
        args.patterns.length > 0 ||
        args.perPackage ||
        args.junit !== undefined ||
        args.units !== undefined ||
        args.testListOut !== undefined
    ) {
        throw new UsageError(
            '--record takes no patterns, command, --per-package, --junit, --units or --test-list-out: it only records.',
        );
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

/** Root-relative directories of the workspace packages, for `--per-package`. */
async function getPackageDirs(root: string): Promise<string[]> {
    const packages = await getPackages(root);
    return packages.map(pkg => relativePosixPath(root, pkg.path)).filter(dir => dir !== '' && !dir.startsWith('..'));
}

/** `nzyme git affected: recorded 5 · 1 failed (2 variants invalidated) · 1 not recorded (a.test.ts: edited b.ts)`. */
function describeRecording(recording: JunitRecording): string {
    const parts = [`nzyme git affected: recorded ${recording.recorded.length}`];
    if (recording.failed.length > 0) {
        parts.push(`${recording.failed.length} failed (${recording.invalidated} variants invalidated)`);
    }
    if (recording.refused.length > 0) {
        const refusals = recording.refused.map(({ file, reason }) =>
            reason.kind === 'not-passed' ? file : `${file}: ${reason.kind} ${reason.file}`,
        );
        parts.push(`${recording.refused.length} not recorded (${refusals.join(', ')})`);
    }
    if (recording.unreported.length > 0) {
        parts.push(`${recording.unreported.length} without a passing testcase in the report`);
    }
    return parts.join(' · ');
}

/** `nzyme git affected: recorded 5 · 1 failed (2 variants invalidated) · 2 not recorded (no-heartbeat: 1, edited: 1)`. */
function describeTracedRecording(recording: TracedRecording): string {
    const parts = [`nzyme git affected: recorded ${recording.recorded}`];
    if (recording.failed.length > 0) {
        parts.push(`${recording.failed.length} failed (${recording.invalidated} variants invalidated)`);
    }
    if (recording.refused.size > 0) {
        const total = [...recording.refused.values()].reduce((sum, count) => sum + count, 0);
        const reasons = [...recording.refused].map(([reason, count]) => `${reason}: ${count}`);
        parts.push(`${total} not recorded (${reasons.join(', ')})`);
    }
    return parts.join(' · ');
}

/** The recordings of several runs (one per package) as one. */
function mergeRecordings(recordings: readonly JunitRecording[]): JunitRecording {
    const merged: JunitRecording = { recorded: [], refused: [], failed: [], invalidated: 0, unreported: [] };
    for (const recording of recordings) {
        merged.recorded.push(...recording.recorded);
        merged.refused.push(...recording.refused);
        merged.failed.push(...recording.failed);
        merged.invalidated += recording.invalidated;
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
