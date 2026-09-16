import type { LinearClient } from '@linear/sdk';
import { expect, mock, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging';

import { handleTaskAssignment } from './handleTaskAssignment.js';
import type { HandleTaskAssignmentParams } from './handleTaskAssignment.js';

const CURRENT_USER = { id: 'current-user', displayName: 'Current User' };
const OTHER_USER = { id: 'other-user', displayName: 'Other User' };

function createParams(
    overrides: Partial<{
        assignee: typeof OTHER_USER | undefined;
        unattended: boolean;
    }>,
): { params: HandleTaskAssignmentParams; update: ReturnType<typeof mock> } {
    const update = mock(() => Promise.resolve());

    const linearClient = {
        viewer: Promise.resolve(CURRENT_USER),
    } as unknown as LinearClient;

    const issueData = {
        assignee: Promise.resolve(overrides.assignee),
        update,
    } as unknown as HandleTaskAssignmentParams['issueData'];

    const { logger } = createTestLogger('handleTaskAssignment.test');

    return {
        params: { linearClient, issueData, logger, unattended: overrides.unattended },
        update,
    };
}

// The bug this guards against: an unattended run on an unassigned-but-delegated issue used to
// silently claim it for the token owner, even though delegation must leave assignment alone.
test('an unattended run does not claim an unassigned issue', async () => {
    const { params, update } = createParams({ assignee: undefined, unattended: true });

    await handleTaskAssignment(params);

    expect(update).not.toHaveBeenCalled();
});

test('an unattended run leaves an issue assigned to someone else alone', async () => {
    const { params, update } = createParams({ assignee: OTHER_USER, unattended: true });

    await handleTaskAssignment(params);

    expect(update).not.toHaveBeenCalled();
});

test('an attended run assigns an unassigned issue to the current user', async () => {
    const { params, update } = createParams({ assignee: undefined, unattended: false });

    await handleTaskAssignment(params);

    expect(update).toHaveBeenCalledWith({ assigneeId: CURRENT_USER.id });
});
