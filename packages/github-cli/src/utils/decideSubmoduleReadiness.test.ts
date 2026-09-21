import { expect, test } from 'bun:test';

import { decideSubmoduleReadiness } from './decideSubmoduleReadiness.js';

const SUBMODULE = 'nzyme';
const TASK_BRANCH = 'feat/decouple-submodule-flow';

test('a dirty working tree is refused, naming the submodule and branch', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: TASK_BRANCH,
            isBaseBranch: false,
            isDirty: true,
            hasUnpushedCommits: false,
            pr: { status: 'open', number: 42 },
        }),
    ).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE} has uncommitted changes on ${TASK_BRANCH}.`,
        remedy: `Commit them in ${SUBMODULE} using Conventional Commits, then push ${TASK_BRANCH}.`,
    });
});

test('commits not on origin are refused, asking for a push', () => {
    const result = decideSubmoduleReadiness({
        submoduleName: SUBMODULE,
        branchName: TASK_BRANCH,
        isBaseBranch: false,
        isDirty: false,
        hasUnpushedCommits: true,
        pr: { status: 'open', number: 42 },
    });

    expect(result).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE} has commits on ${TASK_BRANCH} that are not on its origin remote.`,
        remedy: `Push ${TASK_BRANCH} in ${SUBMODULE}.`,
    });
});

test('a non-base branch with no open PR is refused, asking to open one', () => {
    const result = decideSubmoduleReadiness({
        submoduleName: SUBMODULE,
        branchName: TASK_BRANCH,
        isBaseBranch: false,
        isDirty: false,
        hasUnpushedCommits: false,
        pr: { status: 'none' },
    });

    expect(result).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE} is on ${TASK_BRANCH}, which has no open pull request.`,
        remedy: `Open a pull request for ${TASK_BRANCH} in ${SUBMODULE}.`,
    });
});

test('a non-base branch with an open PR, clean and pushed, is ready', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: TASK_BRANCH,
            isBaseBranch: false,
            isDirty: false,
            hasUnpushedCommits: false,
            pr: { status: 'open', number: 42 },
        }),
    ).toEqual({ kind: 'ready' });
});

test('a merged PR, clean and fully pushed, parks the submodule on base instead of refusing', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: TASK_BRANCH,
            isBaseBranch: false,
            isDirty: false,
            hasUnpushedCommits: false,
            pr: { status: 'merged', number: 42 },
        }),
    ).toEqual({ kind: 'park-on-base' });
});

// The merged-branch case gets its own message ahead of the generic dirty/unpushed wording:
// pushing more commits to an already-merged branch is the wrong instruction, so the remedy is to
// start a new branch instead.
test('a merged PR with dirty changes is refused with a start-a-new-branch remedy, not the generic one', () => {
    const result = decideSubmoduleReadiness({
        submoduleName: SUBMODULE,
        branchName: TASK_BRANCH,
        isBaseBranch: false,
        isDirty: true,
        hasUnpushedCommits: false,
        pr: { status: 'merged', number: 42 },
    });

    expect(result).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE}'s PR #42 for ${TASK_BRANCH} is already merged, and ${TASK_BRANCH} still carries additional work.`,
        remedy: `Start a new branch in ${SUBMODULE} for that work — ${TASK_BRANCH} is done.`,
    });
});

test('a merged PR with unpushed commits also gets the start-a-new-branch remedy', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: TASK_BRANCH,
            isBaseBranch: false,
            isDirty: false,
            hasUnpushedCommits: true,
            pr: { status: 'merged', number: 42 },
        }),
    ).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE}'s PR #42 for ${TASK_BRANCH} is already merged, and ${TASK_BRANCH} still carries additional work.`,
        remedy: `Start a new branch in ${SUBMODULE} for that work — ${TASK_BRANCH} is done.`,
    });
});

// The one rule the detached-HEAD row owns on its own: a commit reachable from no remote branch at
// all means the work exists only in this checkout.
test('a detached HEAD resolvable to no remote branch at all is refused', () => {
    const result = decideSubmoduleReadiness({
        submoduleName: SUBMODULE,
        branchName: null,
        isBaseBranch: false,
        isDirty: false,
        hasUnpushedCommits: false,
        pr: { status: 'none' },
    });

    expect(result).toEqual({
        kind: 'refuse',
        reason: `${SUBMODULE}'s HEAD is detached and its commit is not reachable from any remote branch.`,
        remedy: `Push the commit to a branch in ${SUBMODULE} so the work exists somewhere other than this checkout.`,
    });
});

test('a clean base branch, fully pushed, is ready', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: 'main',
            isBaseBranch: true,
            isDirty: false,
            hasUnpushedCommits: false,
            pr: { status: 'none' },
        }),
    ).toEqual({ kind: 'ready' });
});

// The dirty/unpushed rules are unqualified in the spec table - they apply on base branches too,
// not only on task branches.
test('a dirty base branch is refused just like a dirty task branch', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: 'main',
            isBaseBranch: true,
            isDirty: true,
            hasUnpushedCommits: false,
            pr: { status: 'none' },
        }).kind,
    ).toBe('refuse');
});

test('a base branch with unpushed commits is refused', () => {
    expect(
        decideSubmoduleReadiness({
            submoduleName: SUBMODULE,
            branchName: 'main',
            isBaseBranch: true,
            isDirty: false,
            hasUnpushedCommits: true,
            pr: { status: 'none' },
        }).kind,
    ).toBe('refuse');
});
