/**
 * What to do about uncommitted changes that are in the way of a checkout.
 */
export type DirtyCheckoutDecision =
    /**
     * Put the choice to the user.
     */
    | 'ask'
    /**
     * Check out and leave the changes where they are.
     */
    | 'proceed'
    /**
     * Stop: the changes would move to a branch that is not theirs.
     */
    | 'refuse';

/**
 * Inputs to {@link decideDirtyCheckout}.
 */
export interface DecideDirtyCheckoutParams {
    /**
     * Branch the working tree is on, if it is on one.
     */
    currentBranch: string | null;

    /**
     * Branch being checked out.
     */
    targetBranch: string;

    /**
     * Whether a question can actually be answered — a terminal is attached.
     */
    interactive: boolean;

    /**
     * Whether the caller is authorised to act without asking.
     */
    unattended?: boolean;
}

/**
 * Decide what to do about uncommitted changes when a checkout is about to move the working tree.
 *
 * Asking is the answer whenever someone can answer, so an ordinary checkout is unchanged.
 *
 * With nobody to ask, exactly one shape is safe: the working tree is **already on the target
 * branch**, which is what resuming interrupted work looks like. The checkout is then a no-op and
 * the changes stay exactly where they are — better than stashing them, because the stash stack is
 * shared by every worktree of a repository, so a stash pushed here can be popped by an unrelated
 * session.
 *
 * Every other shape refuses, and that is the part worth being strict about: `git checkout` only
 * fails when a dirty file differs between the two commits. When the dirty files happen not to
 * overlap it **succeeds silently**, carrying someone else's work onto this branch — a data-loss
 * shape no run without a human should be able to reach.
 * @param params Branches, and whether anyone is there to ask.
 * @returns What the caller should do.
 * @__NO_SIDE_EFFECTS__
 */
export function decideDirtyCheckout(params: DecideDirtyCheckoutParams): DirtyCheckoutDecision {
    const { currentBranch, targetBranch, interactive, unattended } = params;

    if (interactive && !unattended) {
        return 'ask';
    }

    // A detached HEAD is `null` here, and is never the branch we are heading for.
    return currentBranch === targetBranch ? 'proceed' : 'refuse';
}
