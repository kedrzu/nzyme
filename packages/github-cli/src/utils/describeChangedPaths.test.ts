import { expect, test } from 'bun:test';

import { describeChangedPaths } from './describeChangedPaths.js';

test('no paths falls back to the caller default', () => {
    expect(describeChangedPaths([])).toBeNull();
});

test('a single changed path is named in full', () => {
    expect(describeChangedPaths(['packages/cli/src/git/CheckoutCommand.ts'])).toBe(
        'packages/cli/src/git/CheckoutCommand.ts',
    );
});

test('several paths in one directory collapse to that directory', () => {
    expect(
        describeChangedPaths([
            'packages/cli/src/git/CheckoutCommand.ts',
            'packages/cli/src/git/PushCommand.ts',
            'packages/cli/src/git/StatusCommand.ts',
        ]),
    ).toBe('packages/cli/src/git');
});

test('two directories are joined naturally with "and"', () => {
    expect(describeChangedPaths(['docs/index.md', 'src/api/handler.ts'])).toBe('docs and src/api');
});

test('a few directories are all named when they fit the cap', () => {
    expect(describeChangedPaths(['docs/index.md', 'packages/cli/src/git/PushCommand.ts', 'src/api/handler.ts'])).toBe(
        'docs, packages/cli/src/git and src/api',
    );
});

test('more directories than the cap collapse the remainder into "and N more"', () => {
    const result = describeChangedPaths(['a/file.ts', 'b/file.ts', 'c/file.ts', 'd/file.ts', 'e/file.ts']);

    expect(result).toBe('a, b, c and 2 more');
});

// A root-level path has no directory to group under; grouping it as '.' would read like a typo,
// so distinct root files never collapse into one fake "root" group.
test('root-level paths never collapse into a "." group', () => {
    const result = describeChangedPaths(['package.json', 'README.md']);

    expect(result).not.toContain('.,');
    expect(result).not.toMatch(/^\.($| )/);
    expect(result).toBe('README.md and package.json');
});

test('a single root-level path is named in full, not shortened to "."', () => {
    expect(describeChangedPaths(['package.json'])).toBe('package.json');
});

// Same file set, different order — the message a run produces must not depend on the order
// `git status` happened to report the paths in.
test('the result is deterministic regardless of input order', () => {
    const paths = ['src/api/handler.ts', 'docs/index.md', 'src/api/other.ts', 'README.md'];
    const shuffled = paths.toReversed();

    expect(describeChangedPaths(paths)).toBe(describeChangedPaths(shuffled));
});

// A 200-file change across many directories must still produce a single, short subject line —
// never something that wraps a git commit subject onto a second line.
test('a large number of changed directories is capped to a short description', () => {
    const paths = Array.from({ length: 200 }, (_, index) => `dir-${index}/file.ts`);

    const result = describeChangedPaths(paths);

    expect(result).not.toBeNull();
    expect(result?.length).toBeLessThanOrEqual(50);
});

test('a single very long path is truncated rather than left unbounded', () => {
    const longPath = `packages/${'a'.repeat(100)}/File.ts`;

    const result = describeChangedPaths([longPath]);

    expect(result).not.toBeNull();
    expect(result?.length).toBeLessThanOrEqual(50);
    expect(result?.endsWith('…')).toBe(true);
});
