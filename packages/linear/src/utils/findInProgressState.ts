import type { Team, WorkflowState } from '@linear/sdk';

/**
 * Find the "In Progress" workflow state for a Linear team.
 *
 * Predicate order is deliberate: prefer an exact name match before falling back
 * to `type === 'started'`. Linear teams can have multiple started-type states
 * (e.g. "In Progress" and "In Review"), so a bare type check would silently land
 * the task in whichever started state the API returns first.
 *
 * @returns The matching workflow state, or `undefined` if none is found.
 */
export async function findInProgressState(team: Team): Promise<WorkflowState | undefined> {
    const workflowStates = await team.states();

    return workflowStates.nodes.find(
        state =>
            state.name.toLowerCase() === 'in progress' ||
            state.name.toLowerCase() === 'inprogress' ||
            state.type === 'started',
    );
}
