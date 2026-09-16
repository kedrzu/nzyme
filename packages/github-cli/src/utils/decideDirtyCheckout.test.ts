import { expect, test } from 'bun:test';

import { decideDirtyCheckout } from './decideDirtyCheckout.js';

const TASK_BRANCH = 'feature/sig-472-unattended';
const OTHER_BRANCH = 'feature/sig-999-something-else';

test('a person at a terminal is always asked', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: OTHER_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: true,
        }),
    ).toBe('ask');
});

test('resuming in place keeps the uncommitted work where it is', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: TASK_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: false,
            unattended: true,
        }),
    ).toBe('proceed');
});

// The data-loss shape: git lets this through whenever the dirty files do not differ between the
// two commits, so nothing downstream would report that the work moved branches.
test('carrying uncommitted changes onto another branch is refused', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: OTHER_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: false,
            unattended: true,
        }),
    ).toBe('refuse');
});

test('a detached HEAD is never the target branch', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: null,
            targetBranch: TASK_BRANCH,
            interactive: false,
            unattended: true,
        }),
    ).toBe('refuse');
});

// Without a terminal there is nobody to answer, so the same rules apply even unauthorised - the
// alternative is enquirer waiting forever.
test('no terminal and no authorisation still resolves rather than asking', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: TASK_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: false,
        }),
    ).toBe('proceed');

    expect(
        decideDirtyCheckout({
            currentBranch: OTHER_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: false,
        }),
    ).toBe('refuse');
});

// Authorisation removes the question, not the safety rule.
test('authorisation alone does not license moving work between branches', () => {
    expect(
        decideDirtyCheckout({
            currentBranch: OTHER_BRANCH,
            targetBranch: TASK_BRANCH,
            interactive: true,
            unattended: true,
        }),
    ).toBe('refuse');
});
