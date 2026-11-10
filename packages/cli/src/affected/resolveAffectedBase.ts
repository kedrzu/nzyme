import { readFile } from 'node:fs/promises';

import { execa } from 'execa';

import { GitRepository } from '../submodule/GitRepository.js';

/** Where the base of an `affected` run came from, in resolution order. */
export type AffectedBaseSource = 'explicit' | 'github-pr' | 'github-push' | 'pr' | 'auto';

/** The base a change set is measured against. */
export interface AffectedBase {
    /** The ref (or sha) the base was named by. */
    ref: string;
    /** The commit changed files are diffed against: `git merge-base HEAD <ref>`. */
    mergeBase: string;
    source: AffectedBaseSource;
}

/** The environment variables base resolution reads — passed in so callers and tests control them. */
export interface AffectedBaseEnv {
    NZYME_AFFECTED_BASE?: string | undefined;
    GITHUB_ACTIONS?: string | undefined;
    GITHUB_BASE_REF?: string | undefined;
    GITHUB_EVENT_NAME?: string | undefined;
    GITHUB_EVENT_PATH?: string | undefined;
}

export interface ResolveAffectedBaseOptions {
    /** Git working tree to resolve in. */
    root: string;
    /** The `--base` flag; the value `pr` asks GitHub for the current branch's pull request base. */
    base?: string | undefined;
    env: AffectedBaseEnv;
    /** Branches tried by auto detection, as `origin/<name>`. */
    baseBranches: readonly string[];
    /** Runs `gh` and returns its stdout; defaults to the `gh` on PATH. Injectable for tests. */
    runGh?: (args: string[], cwd: string) => Promise<string>;
}

const ZERO_SHA = /^0+$/;

/**
 * Picks the base commit that changed files are measured against.
 *
 * Order: explicit `--base` / `NZYME_AFFECTED_BASE` (flag wins); GitHub Actions pull request base or
 * push `before` sha; `pr` (the open pull request's base branch via `gh`); otherwise the nearest of
 * the `baseBranches` by commits between its merge-base and `HEAD`. Throws when the base cannot be
 * determined — it never falls back to "nothing changed".
 */
export async function resolveAffectedBase(options: ResolveAffectedBaseOptions): Promise<AffectedBase> {
    const { root, env } = options;
    const git = new GitRepository(root);
    const explicit = nonEmpty(options.base) ?? nonEmpty(env.NZYME_AFFECTED_BASE);

    if (explicit !== undefined && explicit !== 'pr') {
        return await withMergeBase(git, explicit, 'explicit');
    }

    if (explicit === undefined && env.GITHUB_ACTIONS === 'true') {
        const baseRef = nonEmpty(env.GITHUB_BASE_REF);
        if (baseRef !== undefined) {
            return await withMergeBase(git, `origin/${baseRef}`, 'github-pr');
        }

        if (env.GITHUB_EVENT_NAME === 'push') {
            const before = await readPushBefore(env.GITHUB_EVENT_PATH);
            if (!ZERO_SHA.test(before)) {
                return await withMergeBase(git, before, 'github-push');
            }
            // A new branch has no previous sha — fall through to auto detection.
        }
    }

    if (explicit === 'pr') {
        const runGh = options.runGh ?? runGhOnPath;
        const baseRefName = (await runGh(['pr', 'view', '--json', 'baseRefName', '--jq', '.baseRefName'], root)).trim();
        if (baseRefName === '') {
            throw new Error('`gh pr view` returned no base branch for the current branch.');
        }

        return await withMergeBase(git, `origin/${baseRefName}`, 'pr');
    }

    return await detectBase(git, options.baseBranches);
}

async function detectBase(git: GitRepository, baseBranches: readonly string[]): Promise<AffectedBase> {
    const candidates = baseBranches.map(name => `origin/${name}`);
    let best: (AffectedBase & { distance: number }) | undefined;

    for (const ref of candidates) {
        if ((await git.resolveLocalCommit(ref)) === null) {
            continue;
        }

        const mergeBase = await git.git(['merge-base', 'HEAD', ref]);
        const distance = await git.countCommits(mergeBase, 'HEAD');
        if (best === undefined || distance < best.distance) {
            best = { ref, mergeBase, source: 'auto', distance };
        }
    }

    if (best === undefined) {
        throw new Error(
            `Cannot detect the base: none of ${candidates.join(', ')} exists in ${git.dir}. ` +
                'Fetch the base branch, configure `baseBranches`, or pass --base <ref>.',
        );
    }

    return { ref: best.ref, mergeBase: best.mergeBase, source: best.source };
}

async function withMergeBase(git: GitRepository, ref: string, source: AffectedBaseSource): Promise<AffectedBase> {
    if ((await git.resolveLocalCommit(ref)) === null) {
        throw new Error(`Base "${ref}" (${source}) does not exist in ${git.dir}. Fetch it or pass --base <ref>.`);
    }

    return { ref, mergeBase: await git.git(['merge-base', 'HEAD', ref]), source };
}

async function readPushBefore(eventPathEnv: string | undefined): Promise<string> {
    const eventPath = nonEmpty(eventPathEnv);
    if (eventPath === undefined) {
        throw new Error('GITHUB_EVENT_NAME is "push" but GITHUB_EVENT_PATH is not set.');
    }

    const event: unknown = JSON.parse(await readFile(eventPath, 'utf8'));
    const before = typeof event === 'object' && event !== null && 'before' in event ? event.before : undefined;
    if (typeof before !== 'string' || before === '') {
        throw new Error(`The push event in ${eventPath} has no "before" sha.`);
    }

    return before;
}

async function runGhOnPath(args: string[], cwd: string): Promise<string> {
    const result = await execa('gh', args, { cwd, reject: false });
    if (result.exitCode !== 0) {
        throw new Error(
            `gh ${args.join(' ')} failed (exit ${result.exitCode ?? 'none'}): ${result.stderr || result.message}`,
        );
    }

    return result.stdout;
}

function nonEmpty(value: string | undefined): string | undefined {
    return value === undefined || value === '' ? undefined : value;
}
