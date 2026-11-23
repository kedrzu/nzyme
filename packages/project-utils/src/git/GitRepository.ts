import { execa } from 'execa';

/** Mode git records for a gitlink — a tree entry that pins a submodule's commit. */
const GITLINK_MODE = '160000';

/** Outcome of a git invocation that is allowed to fail. */
export interface GitResult {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * The small set of git plumbing affected selection and `git base` read repositories and submodules
 * through, bound to one working directory (a repository or a submodule's clone inside it).
 *
 * Plain `git` through `execa` rather than a git library: every operation here is one command whose
 * exit code or output is the answer (`ls-tree`, `rev-parse --show-prefix`).
 */
export class GitRepository {
    constructor(readonly dir: string) {}

    /** The submodule commit `revision` records for `submodulePath`, or `null` when it is not a submodule there. */
    async findGitlink(revision: string, submodulePath: string): Promise<string | null> {
        const entry = await this.git(['ls-tree', revision, '--', submodulePath]);
        const match = /^(\d+) \w+ ([0-9a-f]+)\t/.exec(entry);
        return match?.[2] && match[1] === GITLINK_MODE ? match[2] : null;
    }

    /**
     * Whether this directory is the top of a checked-out repository. An uninitialised submodule is an
     * empty directory, and git run inside it would silently act on the parent repository instead.
     */
    async isCheckedOut(): Promise<boolean> {
        const prefix = await this.tryGit(['rev-parse', '--show-prefix']);
        return prefix.ok && prefix.stdout === '';
    }

    /** Runs git and returns its trimmed stdout; throws with git's stderr when it fails. */
    async git(args: string[]): Promise<string> {
        const result = await this.tryGit(args);
        if (!result.ok) {
            throw new Error(`git ${args.join(' ')} failed (exit ${result.exitCode}) in ${this.dir}:\n${result.stderr}`);
        }

        return result.stdout;
    }

    /**
     * Runs git without throwing on a non-zero exit. Terminal prompts are disabled: in CI a missing
     * credential must fail the step, not hang it until the job times out.
     */
    async tryGit(args: string[]): Promise<GitResult> {
        const result = await execa('git', args, {
            cwd: this.dir,
            reject: false,
            env: { GIT_TERMINAL_PROMPT: '0' },
        });

        // No exit code when git could not be started at all (e.g. a missing working directory).
        const exitCode = result.exitCode ?? 1;
        const stderr = result.stderr.trim();
        return {
            ok: exitCode === 0,
            exitCode,
            stdout: result.stdout.trim(),
            stderr: stderr || (result instanceof Error ? result.message : ''),
        };
    }
}
