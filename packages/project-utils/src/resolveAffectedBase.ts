import { readFile } from 'node:fs/promises';

import { execa } from 'execa';

/** Where the base of a change set came from, in resolution order. */
export type AffectedBaseSource = 'explicit' | 'github-pr' | 'github-push' | 'auto';

/** The base a change set is measured against. */
export interface AffectedBase {
    /** The ref (or sha) the base was named by — passed back as an explicit base, it resolves the same commit. */
    ref: string;
    /** The commit changed files are diffed against: `git merge-base HEAD <ref>`. */
    mergeBase: string;
    source: AffectedBaseSource;
}

/**
 * The environment variables base resolution reads — passed in so callers and tests control them
 * (`process.env` satisfies it; the index signature is what lets it).
 */
export interface AffectedBaseEnv {
    [name: string]: string | undefined;
    GITHUB_ACTIONS?: string | undefined;
    GITHUB_BASE_REF?: string | undefined;
    GITHUB_EVENT_NAME?: string | undefined;
    GITHUB_EVENT_PATH?: string | undefined;
}

/** Options of {@link resolveAffectedBase}. */
export interface ResolveAffectedBaseOptions {
    /** Git working tree to resolve in. */
    root: string;
    /** An explicit base ref (the `--base` option); wins over everything else. */
    base?: string | undefined;
    env: AffectedBaseEnv;
    /** Branches tried by auto detection, as `origin/<name>` — the branches a change can merge into. */
    baseBranches: readonly string[];
}

const ZERO_SHA = /^0+$/;

/**
 * Picks the base commit a change set is measured against — the one place every tool that scopes work
 * to "what changed" (`nzyme git affected`, `nzyme git base` and the scripts built on it) gets it
 * from, so they never disagree.
 *
 * Order: the explicit `base`; GitHub Actions pull request base or push `before` sha; otherwise the
 * nearest of the `baseBranches` by commits between its merge-base and `HEAD`. Throws when the base cannot be determined — it never falls back to "nothing changed".
 *
 * @util
 */
export async function resolveAffectedBase(options: ResolveAffectedBaseOptions): Promise<AffectedBase> {
    const { root, env } = options;
    const explicit = nonEmpty(options.base);

    if (explicit !== undefined) {
        return await withMergeBase(root, explicit, 'explicit');
    }

    if (env.GITHUB_ACTIONS === 'true') {
        const baseRef = nonEmpty(env.GITHUB_BASE_REF);
        if (baseRef !== undefined) {
            return await withMergeBase(root, `origin/${baseRef}`, 'github-pr');
        }

        if (env.GITHUB_EVENT_NAME === 'push') {
            const before = await readPushBefore(env.GITHUB_EVENT_PATH);
            if (!ZERO_SHA.test(before)) {
                return await withMergeBase(root, before, 'github-push');
            }
            // A new branch has no previous sha — fall through to auto detection.
        }
    }

    return await detectBase(root, options.baseBranches);
}

async function detectBase(root: string, baseBranches: readonly string[]): Promise<AffectedBase> {
    const candidates = baseBranches.map(name => `origin/${name}`);
    let best: (AffectedBase & { distance: number }) | undefined;

    for (const ref of candidates) {
        if (!(await commitExists(root, ref))) {
            continue;
        }

        const mergeBase = await git(root, ['merge-base', 'HEAD', ref]);
        const distance = Number(await git(root, ['rev-list', '--count', `${mergeBase}..HEAD`]));
        if (best === undefined || distance < best.distance) {
            best = { ref, mergeBase, source: 'auto', distance };
        }
    }

    if (best === undefined) {
        throw new Error(
            `Cannot detect the base: none of ${candidates.join(', ')} exists in ${root}. ` +
                'Fetch the base branch, configure `baseBranches`, or pass --base <ref>.',
        );
    }

    return { ref: best.ref, mergeBase: best.mergeBase, source: best.source };
}

async function withMergeBase(root: string, ref: string, source: AffectedBaseSource): Promise<AffectedBase> {
    if (!(await commitExists(root, ref))) {
        throw new Error(`Base "${ref}" (${source}) does not exist in ${root}. Fetch it or pass --base <ref>.`);
    }

    return { ref, mergeBase: await git(root, ['merge-base', 'HEAD', ref]), source };
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

/** Whether `revision` resolves to a commit locally (tags peeled). */
async function commitExists(root: string, revision: string): Promise<boolean> {
    const result = await execa('git', ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], {
        cwd: root,
        reject: false,
    });
    return result.exitCode === 0;
}

/** Runs git in `root` and returns its trimmed stdout; throws with git's stderr when it fails. */
async function git(root: string, args: string[]): Promise<string> {
    const result = await execa('git', args, { cwd: root, reject: false });
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed (exit ${result.exitCode ?? '?'}) in ${root}:\n${result.stderr}`);
    }

    return result.stdout.trim();
}

function nonEmpty(value: string | undefined): string | undefined {
    return value === undefined || value === '' ? undefined : value;
}
