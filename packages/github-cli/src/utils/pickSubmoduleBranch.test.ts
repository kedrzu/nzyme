import { expect, test } from 'bun:test';

import { pickSubmoduleBranch } from './pickSubmoduleBranch.js';

const BASE_BRANCHES = ['main', 'release'];

test('no candidates at all means the submodule belongs on base', () => {
    expect(
        pickSubmoduleBranch({
            candidates: [],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'base' });
});

test('only base branches contain the SHA - still base, not ambiguous', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'release'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'base' });
});

test('exactly one task branch resolves unambiguously', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['feat/decouple-submodule-flow'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'branch', name: 'feat/decouple-submodule-flow' });
});

// The realistic shape: a branch not yet merged also still contains the SHA on every base branch
// it was cut from, so base branches must be filtered out rather than merely deprioritised.
test('one task branch mixed with base branches still resolves to that branch', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'feat/decouple-submodule-flow', 'release'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'branch', name: 'feat/decouple-submodule-flow' });
});

test('two task branches containing the same SHA are ambiguous, never guessed', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['feat/decouple-submodule-flow', 'fix/unrelated-task'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({
        kind: 'ambiguous',
        candidates: ['feat/decouple-submodule-flow', 'fix/unrelated-task'],
    });
});

// The package is generic: it must honour whatever base-branch list the caller supplies, not a
// hardcoded 'main'/'release'.
test('a non-standard base branch list is honoured', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['trunk', 'feat/decouple-submodule-flow'],
            baseBranches: ['trunk'],
        }),
    ).toEqual({ kind: 'branch', name: 'feat/decouple-submodule-flow' });

    // Without the caller's list, 'main' would be treated as a task branch instead of base.
    expect(
        pickSubmoduleBranch({
            candidates: ['main'],
            baseBranches: ['trunk'],
        }),
    ).toEqual({ kind: 'branch', name: 'main' });
});
