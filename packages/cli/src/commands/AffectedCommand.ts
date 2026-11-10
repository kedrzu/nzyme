import path from 'node:path';

import { Option, UsageError } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { findOwningPackageDir } from '@nzyme/project-utils/findOwningPackageDir.js';
import { getPackages } from '@nzyme/project-utils/getPackages.js';
import { buildImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';

import { readAffectedConfig } from '../affected/AffectedConfig.js';
import { collectChangedFiles } from '../affected/collectChangedFiles.js';
import { resolveAffectedBase } from '../affected/resolveAffectedBase.js';
import type { AffectedBase } from '../affected/resolveAffectedBase.js';
import type { AffectedSelection } from '../affected/selectAffectedFiles.js';
import { selectAffectedFiles } from '../affected/selectAffectedFiles.js';
import { GitRepository } from '../submodule/GitRepository.js';

/** The environment variable a run command receives the affected files in, `\n`-separated. */
const FILES_ENV = 'NZYME_AFFECTED_FILES';

/**
 * Selects the files a change can affect — the changed files plus everything importing them,
 * transitively, from one scan of the project's import graph — and prints them or runs a command on
 * them, so a test runner executes only the tests a change can break. See the ADR
 * `docs/decisions/file-level-affected-selection-by-full-import-scan.md`.
 *
 * stdout is a contract (callers parse the file list), so every diagnostic goes to stderr.
 */
export class AffectedCommand extends Command {
    static override paths = [['affected']];

    static override usage = Command.Usage({
        category: 'Testing',
        description: 'Select the files a change can affect, and print them or run a command on them',
        details: `
            Usage: \`nzyme affected [--base <ref>|pr] [--per-package] <pattern…> [-- <cmd…>]\`.

            Diffs the working tree (commits, staged, unstaged, untracked; submodules against the
            gitlink of the base) against the base, scans the import graph once and selects the
            changed files plus their transitive importers that match a pattern. A pattern without
            \`/\` matches the basename (\`*.test.ts\`), one with \`/\` the root-relative path
            (\`packages/{ui,app}/**/*.stories.tsx\`).

            Without \`--\`: prints the selected root-relative paths, one per line, to stdout. With
            \`-- <cmd…>\`: runs the command with the files appended as arguments and in
            \`${FILES_ENV}\` (newline-separated), exiting with its exit code. \`--per-package\`
            runs it once per owning package, sequentially, in the package directory with paths
            relative to it, and exits with the first non-zero code. No affected files: nothing
            runs, exit 0.

            Base: \`--base <ref>\` or \`NZYME_AFFECTED_BASE\`; in GitHub Actions the pull request
            base or the push \`before\`; \`--base pr\` asks \`gh\` for the current pull request's
            base; otherwise the nearest of \`baseBranches\` (as \`origin/<name>\`).

            Configured by the \`nzyme.affected\` field of the root package.json, all optional:
            \`baseBranches\` (default \`["main"]\`), \`aliases\` ({ prefix, packages }[]),
            \`rewrites\` ({ from, to }[] — a changed path ending in \`from\` also changes the path
            ending in \`to\`), \`fullRunTriggers\` and \`ignore\` (globs matched against the
            root-relative path, never the basename).
        `,
        examples: [
            ['List the tests affected by the change', "nzyme affected '*.test.ts'"],
            ['Run the affected tests', "nzyme affected '*.test.ts' -- bun test"],
            [
                'Run affected stories per package',
                "nzyme affected --per-package 'packages/*/src/**/*.stories.tsx' -- bunx vitest run --project=storybook",
            ],
        ],
    });

    /**
     * Everything after `affected`, parsed by {@link parseAffectedArgs}: clipanion cannot tell the
     * patterns from the command after `--` (a rest list swallows both, and a proxy cannot sit beside one).
     */
    args = Option.Proxy({ name: 'args' });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        if (isHelpRequest(this.args)) {
            this.context.stdout.write(this.cli.usage(AffectedCommand, { detailed: true }));
            return 0;
        }

        const args = parseAffectedArgs(this.args);
        const root = await new GitRepository(this.cwd).git(['rev-parse', '--show-toplevel']);
        const [config, packages] = await Promise.all([readAffectedConfig(root), getPackages(root)]);

        const base = await resolveAffectedBase({
            root,
            base: args.base,
            env: {
                NZYME_AFFECTED_BASE: process.env.NZYME_AFFECTED_BASE,
                GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
                GITHUB_BASE_REF: process.env.GITHUB_BASE_REF,
                GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
                GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
            },
            baseBranches: config.baseBranches,
        });
        const changedFiles = await collectChangedFiles({ root, mergeBase: base.mergeBase });
        const graph = await buildImportGraph({
            root,
            packages,
            aliases: config.aliases,
            extraPaths: changedFiles.filter(file => file.deleted).map(file => file.path),
        });

        const packageDirs = packages
            .map(pkg => relativePosixPath(root, pkg.path))
            .filter(dir => dir !== '' && !dir.startsWith('..'));
        const selection = selectAffectedFiles({ graph, changedFiles, config, patterns: args.patterns, packageDirs });

        this.context.stderr.write(`${describeRun(base, changedFiles.length, selection)}\n`);

        if (selection.files.length === 0) {
            this.context.stderr.write('no affected files\n');
            return 0;
        }

        if (!args.command) {
            this.context.stdout.write(`${selection.files.join('\n')}\n`);
            return 0;
        }

        const groups = args.perPackage
            ? groupByPackage(selection.files, packageDirs)
            : [{ dir: '', files: selection.files }];
        let exitCode = 0;
        for (const group of groups) {
            if (args.perPackage) {
                this.context.stderr.write(`nzyme affected: ${group.dir || '.'} (${group.files.length} files)\n`);
            }
            const groupExitCode = await this.runCommand(args.command, path.join(root, group.dir), group.files);
            if (exitCode === 0) {
                exitCode = groupExitCode;
            }
        }

        return exitCode;
    }

    /** Runs the command in `cwd` with `files` (relative to it) as trailing arguments and in {@link FILES_ENV}. */
    private async runCommand(command: AffectedRunCommand, cwd: string, files: string[]): Promise<number> {
        const { exitCode, error } = await spawnForExitCode({
            executable: command.executable,
            args: [...command.args, ...files],
            stdio: 'inherit',
            env: { ...process.env, [FILES_ENV]: files.join('\n') },
            cwd,
        });

        if (error) {
            this.context.stderr.write(`nzyme affected: ${command.executable}: ${error.message}\n`);
        }

        return exitCode;
    }
}

/** The parsed arguments of `nzyme affected`. */
interface AffectedArgs {
    base?: string;
    perPackage: boolean;
    patterns: string[];
    /** The command after `--`, when given. */
    command?: AffectedRunCommand;
}

/** The command `nzyme affected` runs on the selected files. */
interface AffectedRunCommand {
    executable: string;
    args: string[];
}

/** Files of one owning package, relative to its directory `dir` (root-relative; `''` is the root). */
interface AffectedFileGroup {
    dir: string;
    files: string[];
}

/** `--help` / `-h` before `--` — the proxy keeps clipanion from seeing it. */
function isHelpRequest(argv: string[]): boolean {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    return own.includes('--help') || own.includes('-h');
}

/**
 * Parses `[--base <ref>|--base=<ref>] [--per-package] <pattern…> [-- <cmd…>]`. Options may stand
 * anywhere before `--`; everything after it is the command, untouched.
 */
function parseAffectedArgs(argv: string[]): AffectedArgs {
    const separator = argv.indexOf('--');
    const own = separator === -1 ? argv : argv.slice(0, separator);
    const result: AffectedArgs = { perPackage: false, patterns: [] };

    for (let i = 0; i < own.length; i++) {
        const token = own[i] ?? '';
        if (token === '--per-package') {
            result.perPackage = true;
        } else if (token === '--base') {
            const value = own[++i];
            if (value === undefined || value === '') {
                throw new UsageError('--base needs a value: a ref, or `pr`.');
            }
            result.base = value;
        } else if (token.startsWith('--base=') && token.length > '--base='.length) {
            result.base = token.slice('--base='.length);
        } else if (token.startsWith('-')) {
            throw new UsageError(`Unknown option ${token}. Put the command to run after \`--\`.`);
        } else {
            result.patterns.push(token);
        }
    }

    if (result.patterns.length === 0) {
        throw new UsageError('Pass at least one pattern, e.g. `nzyme affected "*.test.ts"`.');
    }

    if (separator !== -1) {
        const [executable, ...args] = argv.slice(separator + 1);
        if (executable === undefined) {
            throw new UsageError('Pass the command to run after `--`.');
        }
        result.command = { executable, args };
    }

    if (result.perPackage && !result.command) {
        throw new UsageError('--per-package needs a command to run after `--`.');
    }

    return result;
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
        `nzyme affected: base ${base.ref} (${base.source}, merge-base ${base.mergeBase.slice(0, 10)})`,
        `${changedCount} changed files`,
    ];
    if (selection.fullRun) {
        parts.push(`full run: ${selection.fullRun.file} matches trigger "${selection.fullRun.trigger}"`);
    }
    parts.push(`${selection.files.length} selected`);
    return parts.join(' · ');
}
