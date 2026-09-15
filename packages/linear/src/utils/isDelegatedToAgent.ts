/**
 * Whether an issue is delegated to the agent this process is running as — the authorisation for a
 * run nobody is watching.
 *
 * Two independent facts have to line up, and neither is enough alone:
 *
 * - **identity** — `agentUserId` says which agent this process *is*. It comes from the environment
 *   of the worktree the agent was given, so an ordinary checkout does not have it.
 * - **authorisation** — `delegateId` says which agent the issue was handed to. A human sets it
 *   deliberately, in Linear, before anything runs.
 *
 * Splitting them is the point. Identity alone would let anyone with the variable set walk past
 * every prompt on every issue; delegation alone would mean a human running the CLI on a delegated
 * issue silently took the agent's path instead of being asked. Requiring both leaves the human
 * interactive on exactly the issues the agent is allowed to take.
 *
 * Configured with an id rather than a boolean for the same reason: a wrong or missing value can
 * only fail *towards* asking, never towards acting silently.
 * @param delegateId Id of the agent user the issue is delegated to, if any.
 * @param agentUserId Id of the agent user this process runs as, if any.
 * @returns True when both are present and identical.
 * @__NO_SIDE_EFFECTS__
 */
export function isDelegatedToAgent(delegateId: string | undefined, agentUserId: string | undefined): boolean {
    // Both guards matter: without the first, two absent values compare equal and every issue
    // silently becomes unattended.
    if (!agentUserId || !delegateId) {
        return false;
    }

    return delegateId === agentUserId;
}
