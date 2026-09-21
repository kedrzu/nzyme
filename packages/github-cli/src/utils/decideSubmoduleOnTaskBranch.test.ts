import { expect, test } from 'bun:test';

import { decideSubmoduleOnTaskBranch } from './decideSubmoduleOnTaskBranch.js';

const BASE_BRANCHES = ['main', 'release'];

test('a ready submodule on its own branch carries the task work', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'ready' },
            currentBranch: 'feat/decouple-submodule-flow',
            detached: false,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(true);
});

test('a ready submodule resting on a base branch does not', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'ready' },
            currentBranch: 'main',
            detached: false,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(false);
});

test('a base branch is recognised from the caller list, not a hardcoded name', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'ready' },
            currentBranch: 'trunk',
            detached: false,
            baseBranches: ['trunk'],
        }),
    ).toBe(false);
});

test('a detached HEAD never counts, even when it resolved onto a task branch', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'ready' },
            currentBranch: undefined,
            detached: true,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(false);
});

test('a branch whose pull request already merged is not task work in flight', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'park-on-base' },
            currentBranch: 'feat/already-landed',
            detached: false,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(false);
});

test('a refusal a human was allowed to carry on past is still not task work', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: { kind: 'refuse', reason: 'no open pull request', remedy: 'open one' },
            currentBranch: 'feat/no-pr-yet',
            detached: false,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(false);
});

test('a submodule nothing could judge is never pushed to', () => {
    expect(
        decideSubmoduleOnTaskBranch({
            readiness: null,
            currentBranch: 'feat/on-a-gitlab-remote',
            detached: false,
            baseBranches: BASE_BRANCHES,
        }),
    ).toBe(false);
});
