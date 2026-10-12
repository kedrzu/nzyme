import { expect, test } from 'bun:test';

import { resolveSubmoduleBase } from './resolveSubmoduleBase.js';

test('a pull request landing on the trunk has its submodules follow the trunk', () => {
    expect(resolveSubmoduleBase({ landingTrunk: 'main', trunk: 'main' })).toEqual({ kind: 'trunk', trunk: 'main' });
});

// A hotfix into the product's `release` must never move a submodule onto a `release` of its own —
// nzyme's `release` is its npm release line, a different branch that merely shares the name.
test('a pull request landing on any other branch leaves the submodules on their pin', () => {
    expect(resolveSubmoduleBase({ landingTrunk: 'release', trunk: 'main' })).toEqual({
        kind: 'pin',
        trunk: 'main',
        landingTrunk: 'release',
    });

    expect(resolveSubmoduleBase({ landingTrunk: 'hotfix/2026-10', trunk: 'main' })).toEqual({
        kind: 'pin',
        trunk: 'main',
        landingTrunk: 'hotfix/2026-10',
    });
});

test('the trunk is whatever the caller says it is, not a hardcoded name', () => {
    expect(resolveSubmoduleBase({ landingTrunk: 'develop', trunk: 'develop' })).toEqual({
        kind: 'trunk',
        trunk: 'develop',
    });
    expect(resolveSubmoduleBase({ landingTrunk: 'main', trunk: 'develop' }).kind).toBe('pin');
});
