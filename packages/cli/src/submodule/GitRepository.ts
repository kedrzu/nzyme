import { execa } from 'execa';

/** Mode git records for a gitlink — a tree entry that pins a submodule's commit. */
const GITLINK_MODE = '160000';

/** A commit as listed in a bump summary. */
export interface CommitSummary {
    sha: string;
    subject: string;
}

/** Outcome of a git invocation that is allowed to fail. */
export interface GitResult {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * The small set of git plumbing the submodule commands are built from, bound to one working
 * directory (the product repository or the submodule's clone inside it).
 *
 * Plain `git` through `execa` rather than a git library: every operation here is one command whose
 * exit code is the answer (`merge-base --is-ancestor`, `rev-parse --verify`), and `@nzyme/cli`
 * already depends on `execa`.
 */
export class GitRepository {
    constructor(readonly dir: string) {}

    /**
     * The gitlink of a submodule path — the exact submodule commit the repository's `HEAD` pins.
     *
     * Read from the tree of `HEAD` rather than from the submodule's checkout: the commit is what the
     * product's CI tested, while the checkout may have moved since. Throws when the path is not a
     * submodule at `HEAD`, so a typo in `--path` cannot silently act on nothing.
     */
    async readGitlink(submodulePath: string): Promise<string> {
        const entry = await this.git(['ls-tree', 'HEAD', '--', submodulePath]);
        const match = /^(\d+) \w+ ([0-9a-f]+)\t/.exec(entry);
        if (!match?.[2] || match[1] !== GITLINK_MODE) {
            throw new Error(`"${submodulePath}" is not a submodule at HEAD of ${this.dir} (no gitlink in its tree).`);
        }

        return match[2];
    }

    /**
     * Throws unless this directory is the top of a checked-out repository. An uninitialised
     * submodule is an empty directory, and git run inside it would silently act on the parent
     * repository instead.
     */
    async assertCheckedOut(): Promise<void> {
        const prefix = await this.tryGit(['rev-parse', '--show-prefix']);
        if (!prefix.ok || prefix.stdout !== '') {
            throw new Error(`${this.dir} is not a checked-out submodule. Run \`git submodule update --init\` first.`);
        }
    }

    /**
     * Makes the history deep enough for an ancestry check. A shallow clone (what CI checkouts make by
     * default) cuts the parent links `merge-base --is-ancestor` walks, so a perfectly linear
     * fast-forward would look like a divergence.
     */
    async ensureFullHistory(remote: string): Promise<void> {
        if ((await this.git(['rev-parse', '--is-shallow-repository'])) === 'true') {
            await this.git(['fetch', '--quiet', '--unshallow', remote]);
        }
    }

    /** The commit a branch points at on the remote, or `null` when the branch does not exist there. */
    async getRemoteBranchSha(remote: string, branch: string): Promise<string | null> {
        const ref = `refs/heads/${branch}`;
        const output = await this.git(['ls-remote', remote, ref]);
        for (const line of output.split('\n')) {
            const [sha, name] = line.split('\t');
            if (sha && name === ref) {
                return sha;
            }
        }

        return null;
    }

    /**
     * Fetches a ref (branch, tag or full SHA) from the remote and returns the commit it resolves to,
     * or `null` when the remote does not have it — so callers can fall back to a local lookup.
     */
    async fetchCommit(remote: string, ref: string): Promise<string | null> {
        const fetched = await this.tryGit(['fetch', '--quiet', '--no-tags', remote, ref]);
        if (!fetched.ok) {
            return null;
        }

        return await this.git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    }

    /**
     * Makes sure a commit is present locally, fetching it when it is not — a gitlink can point at a
     * commit the submodule's clone never fetched (e.g. one reachable only from a PR branch).
     */
    async ensureCommit(remote: string, sha: string): Promise<void> {
        if (await this.resolveLocalCommit(sha)) {
            return;
        }

        await this.fetchCommit(remote, sha);
        if (!(await this.resolveLocalCommit(sha))) {
            throw new Error(`Commit ${sha} is not in ${this.dir} and could not be fetched from "${remote}".`);
        }
    }

    /** The commit a local revision resolves to (tags peeled), or `null` when it does not exist locally. */
    async resolveLocalCommit(revision: string): Promise<string | null> {
        const resolved = await this.tryGit(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]);
        return resolved.ok ? resolved.stdout : null;
    }

    /** Whether `ancestor` is reachable from `descendant` — i.e. moving a ref between them is a fast-forward. */
    async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
        const result = await this.tryGit(['merge-base', '--is-ancestor', ancestor, descendant]);
        if (result.exitCode > 1) {
            throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${result.stderr}`);
        }

        return result.ok;
    }

    /** Commits reachable from `to` but not from `from`, newest first — `git log from..to`. */
    async listCommits(from: string, to: string): Promise<CommitSummary[]> {
        const output = await this.git(['log', '--format=%H %s', `${from}..${to}`]);
        const commits: CommitSummary[] = [];
        for (const line of output.split('\n')) {
            const separator = line.indexOf(' ');
            if (separator > 0) {
                commits.push({ sha: line.slice(0, separator), subject: line.slice(separator + 1) });
            }
        }

        return commits;
    }

    /** Number of commits reachable from `to` but not from `from`. */
    async countCommits(from: string, to: string): Promise<number> {
        return Number(await this.git(['rev-list', '--count', `${from}..${to}`]));
    }

    /**
     * The `https://github.com/<owner>/<repo>` URL of a remote, or `null` when it is not on GitHub.
     *
     * Reads the configured URL (not `remote get-url`, which applies `insteadOf` rewrites and so can
     * return a URL with a token in it) and rebuilds it from owner and repo only — the result goes
     * into a PR body, so nothing else from the URL may leak into it.
     */
    async getGitHubRepoUrl(remote: string): Promise<string | null> {
        const configured = await this.tryGit(['config', '--get', `remote.${remote}.url`]);
        const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(configured.stdout);
        if (!configured.ok || !match) {
            return null;
        }

        return `https://github.com/${match[1]}/${match[2]}`;
    }

    /** Throws unless git accepts `refs/heads/<branch>` as a ref name — before anything is fetched or pushed. */
    async assertValidBranchName(branch: string): Promise<void> {
        const result = await this.tryGit(['check-ref-format', `refs/heads/${branch}`]);
        if (!result.ok) {
            throw new Error(`"${branch}" is not a valid branch name.`);
        }
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
