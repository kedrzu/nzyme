import path from 'node:path';

import { GitRepository } from './GitRepository.js';

/** Inputs for {@link mirrorSubmoduleRef}. */
export interface MirrorSubmoduleRefOptions {
    /** The product repository (its working directory). */
    repoDir: string;
    /** Path of the submodule within the product repository, e.g. `nzyme`. */
    submodulePath: string;
    /** Branch in the submodule's remote to advance, e.g. `healed/main`. */
    targetBranch: string;
    /** Remote of the submodule to read the branch from and push it to. */
    remote: string;
    /** Decide and report only; push nothing. */
    dryRun: boolean;
}

/**
 * What mirroring decided:
 * - `create` — the branch did not exist on the remote;
 * - `noop` — it already points at the gitlink;
 * - `fast-forward` — it is an ancestor of the gitlink;
 * - `rollback` — the gitlink is an ancestor of the branch (the product went back);
 * - `diverged` — neither descends from the other.
 *
 * The last two are refusals (see {@link isMirrorRefusal}): the branch is left untouched.
 */
export type MirrorAction = 'create' | 'noop' | 'fast-forward' | 'rollback' | 'diverged';

/** Outcome of {@link mirrorSubmoduleRef}. */
export interface MirrorResult {
    action: MirrorAction;
    /** The commit the product pins. */
    gitlink: string;
    /** Where the branch pointed on the remote before, or `null` when it did not exist. */
    previous: string | null;
    /** Whether the branch was pushed (never in a dry run, never on a refusal). */
    pushed: boolean;
}

/**
 * Advances a per-consumer branch in the submodule's remote (e.g. nzyme's `healed/main`) to the
 * commit the product's `HEAD` pins. Run after the product's CI passed on that commit, it keeps the
 * branch naming an nzyme commit that was tested in that product — never just the latest one.
 *
 * The branch only ever moves forward. A gitlink that does not descend from it — a rollback in the
 * product or a divergence — is refused and the branch left untouched, because rewinding it would
 * drop commits other work (e.g. a hotfix on `<consumer>/release`) may already build on. Nothing is
 * force-pushed: if the branch moves concurrently the push is rejected instead of losing that move.
 */
export async function mirrorSubmoduleRef(options: MirrorSubmoduleRefOptions): Promise<MirrorResult> {
    const { repoDir, submodulePath, targetBranch, remote, dryRun } = options;

    const product = new GitRepository(repoDir);
    await product.assertValidBranchName(targetBranch);
    const gitlink = await product.readGitlink(submodulePath);

    const submodule = new GitRepository(path.resolve(repoDir, submodulePath));
    const previous = await prepareSubmodule({ submodule, remote, targetBranch, gitlink });
    const action = await decideMirrorAction({ submodule, previous, gitlink });

    const pushed = !dryRun && (action === 'create' || action === 'fast-forward');
    if (pushed) {
        // A plain push: the remote rejects anything that is not a fast-forward, which is exactly the guard.
        await submodule.git(['push', '--quiet', remote, `${gitlink}:refs/heads/${targetBranch}`]);
    }

    return { action, gitlink, previous, pushed };
}

/** Whether the action leaves the branch where it was because moving it would not be a fast-forward. */
export function isMirrorRefusal(action: MirrorAction): boolean {
    return action === 'rollback' || action === 'diverged';
}

/** Inputs for {@link prepareSubmodule}. */
interface PrepareSubmoduleOptions {
    submodule: GitRepository;
    remote: string;
    targetBranch: string;
    gitlink: string;
}

/**
 * Gets everything the ancestry check needs into the submodule's clone — full history, the branch's
 * current commit and the gitlink commit itself — and returns where the branch points on the remote
 * (`null` when it does not exist yet).
 */
async function prepareSubmodule(options: PrepareSubmoduleOptions): Promise<string | null> {
    const { submodule, remote, targetBranch, gitlink } = options;

    await submodule.assertCheckedOut();
    await submodule.ensureFullHistory(remote);

    const previous = await submodule.getRemoteBranchSha(remote, targetBranch);
    if (previous) {
        await submodule.ensureCommit(remote, previous);
    }

    await submodule.ensureCommit(remote, gitlink);
    return previous;
}

/** Inputs for {@link decideMirrorAction}. */
interface DecideMirrorActionOptions {
    submodule: GitRepository;
    previous: string | null;
    gitlink: string;
}

/** Classifies the move of the branch from where it is to the gitlink. */
async function decideMirrorAction(options: DecideMirrorActionOptions): Promise<MirrorAction> {
    const { submodule, previous, gitlink } = options;

    if (!previous) {
        return 'create';
    }

    if (previous === gitlink) {
        return 'noop';
    }

    if (await submodule.isAncestor(previous, gitlink)) {
        return 'fast-forward';
    }

    if (await submodule.isAncestor(gitlink, previous)) {
        return 'rollback';
    }

    return 'diverged';
}
