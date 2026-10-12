import { expect, test } from 'bun:test';

import { pickSubmoduleBranch } from './pickSubmoduleBranch.js';

const TRUNK = 'main';

test('no candidates at all means the submodule belongs on the trunk', () => {
    expect(
        pickSubmoduleBranch({
            candidates: [],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'base' });
});

test('the trunk and another long-lived branch contain the SHA - still base, not ambiguous', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'release'],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'base' });
});

test('exactly one task branch resolves unambiguously', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['feat/decouple-submodule-flow'],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'branch', name: 'feat/decouple-submodule-flow' });
});

// The trunk containing the SHA means the commit is already on it. Every branch forked from the
// trunk after that commit contains it too, so containment says nothing about which task it belongs
// to - HLD-589: a pin on `main` was refused as "ambiguous" once two branches had been forked from it.
test('a SHA on the trunk resolves to base, however many task branches also contain it', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'fix-google-mcp-roots-and-reauth', 'gdrive-mcp'],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'base' });

    expect(
        pickSubmoduleBranch({
            candidates: ['main', 'feat/decouple-submodule-flow', 'release'],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'base' });
});

test('two task branches containing the same SHA are ambiguous, never guessed', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['feat/decouple-submodule-flow', 'fix/unrelated-task'],
            trunk: TRUNK,
        }),
    ).toEqual({
        kind: 'ambiguous',
        candidates: ['feat/decouple-submodule-flow', 'fix/unrelated-task'],
    });
});

// The package is generic: it must honour whatever trunk the caller supplies, not a hardcoded 'main'.
test('a non-standard trunk is honoured', () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['trunk', 'feat/decouple-submodule-flow'],
            trunk: 'trunk',
        }),
    ).toEqual({ kind: 'base' });

    // Without the caller's trunk, 'main' would be treated as a task branch instead of base.
    expect(
        pickSubmoduleBranch({
            candidates: ['main'],
            trunk: 'trunk',
        }),
    ).toEqual({ kind: 'branch', name: 'main' });
});

// A submodule's own release line is not a base: nzyme's `release` is its npm release branch, and a
// pin resting only there is not something the product's trunk has absorbed yet.
test("a SHA only on the submodule's release branch is not on base", () => {
    expect(
        pickSubmoduleBranch({
            candidates: ['release'],
            trunk: TRUNK,
        }),
    ).toEqual({ kind: 'branch', name: 'release' });
});
