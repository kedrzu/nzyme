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

// A base branch containing the SHA means the commit is already on base. Every branch forked from
// base after that commit contains it too, so containment says nothing about which task it belongs
// to - HLD-589: a pin on `main` was refused as "ambiguous" once two branches had been forked from it.
test('a SHA on a base branch resolves to base, however many task branches also contain it', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'fix-google-mcp-roots-and-reauth', 'gdrive-mcp'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'base' });

    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'feat/decouple-submodule-flow', 'release'],
            baseBranches: BASE_BRANCHES,
        }),
    ).toEqual({ kind: 'base' });
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
    ).toEqual({ kind: 'base' });

    // Without the caller's list, 'main' would be treated as a task branch instead of base.
    expect(
        pickSubmoduleBranch({
            candidates: ['main'],
            baseBranches: ['trunk'],
        }),
    ).toEqual({ kind: 'branch', name: 'main' });
});
