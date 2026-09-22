import { expect, test } from 'bun:test';

import { submoduleBranchFromPrTitle } from './submoduleBranchFromPrTitle.js';

test('a Conventional Commits title with a scope drops the scope from the branch name', () => {
    expect(submoduleBranchFromPrTitle('feat(linear): decouple submodule flow')).toBe('feat/decouple-submodule-flow');
});

test('a Conventional Commits title without a scope still splits into type and slug', () => {
    expect(submoduleBranchFromPrTitle('fix: pulumi cert arn')).toBe('fix/pulumi-cert-arn');
});

test('a title with no recognisable type yields the bare slug with no prefix', () => {
    expect(submoduleBranchFromPrTitle('Update packages')).toBe('update-packages');
});

test('a breaking-change marker is dropped, not treated as part of the type', () => {
    expect(submoduleBranchFromPrTitle('feat!: decouple submodule flow')).toBe('feat/decouple-submodule-flow');
});

test('a breaking-change marker combined with a scope still resolves correctly', () => {
    expect(submoduleBranchFromPrTitle('feat(linear)!: decouple submodule flow')).toBe('feat/decouple-submodule-flow');
});

test('punctuation in the description collapses to single dashes, trimmed at the edges', () => {
    expect(submoduleBranchFromPrTitle('fix: Resolve @Issue #123 -- broken!!! build')).toBe(
        'fix/resolve-issue-123-broken-build',
    );
});

// The cap must not leave a dangling separator at the cut point - a naive slice(0, 50) here would
// end in '-', which is not a valid trailing character for a branch segment.
test('an overly long description is capped at 50 characters with no trailing separator', () => {
    const longDescription = Array.from({ length: 15 }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ');

    const branch = submoduleBranchFromPrTitle(`chore: ${longDescription}`);

    expect(branch).toBe('chore/w000-w001-w002-w003-w004-w005-w006-w007-w008-w009');
    expect(branch.endsWith('-')).toBe(false);
});
