import { describe, expect, test } from 'bun:test';

import {
    areSameBranchVersions,
    buildNodeBranchName,
    determineNextVersion,
    extractBranchVersion,
    extractNodeIndex,
    getBaseBranchName,
    incrementBranchVersion,
    stripNodeSuffix,
} from './branchVersionHelpers.js';

describe('extractBranchVersion', () => {
    test('returns 1 for branch without version suffix', () => {
        expect(extractBranchVersion('sig-123-feature')).toBe(1);
    });

    test('extracts version from branch with --v2 suffix', () => {
        expect(extractBranchVersion('sig-123-feature--v2')).toBe(2);
    });

    test('extracts version from branch with --v10 suffix', () => {
        expect(extractBranchVersion('sig-123-feature--v10')).toBe(10);
    });

    test('returns 1 for branch with similar pattern but not at end', () => {
        expect(extractBranchVersion('sig-123-v2-feature')).toBe(1);
    });
});

describe('getBaseBranchName', () => {
    test('returns same name for branch without version suffix', () => {
        expect(getBaseBranchName('sig-123-feature')).toBe('sig-123-feature');
    });

    test('removes --v2 suffix', () => {
        expect(getBaseBranchName('sig-123-feature--v2')).toBe('sig-123-feature');
    });

    test('removes --v10 suffix', () => {
        expect(getBaseBranchName('sig-123-feature--v10')).toBe('sig-123-feature');
    });

    test('preserves branch name with similar pattern but not at end', () => {
        expect(getBaseBranchName('sig-123-v2-feature')).toBe('sig-123-v2-feature');
    });
});

describe('stack node suffix', () => {
    test('extractNodeIndex returns 1 for an unstacked branch', () => {
        expect(extractNodeIndex('sig-123-feature')).toBe(1);
        expect(extractNodeIndex('sig-123-feature--v2')).toBe(1);
    });

    test('extractNodeIndex reads the position from the suffix', () => {
        expect(extractNodeIndex('sig-123-feature--s2')).toBe(2);
        expect(extractNodeIndex('sig-123-feature--v2--s10')).toBe(10);
    });

    test('buildNodeBranchName leaves the bottom node unsuffixed', () => {
        expect(buildNodeBranchName('sig-123-feature', 1)).toBe('sig-123-feature');
        expect(buildNodeBranchName('sig-123-feature--s3', 1)).toBe('sig-123-feature');
    });

    test('buildNodeBranchName appends the position and keeps the version', () => {
        expect(buildNodeBranchName('sig-123-feature', 2)).toBe('sig-123-feature--s2');
        expect(buildNodeBranchName('sig-123-feature--v2', 3)).toBe('sig-123-feature--v2--s3');
    });

    test('buildNodeBranchName replaces an existing node suffix instead of nesting it', () => {
        expect(buildNodeBranchName('sig-123-feature--s2', 3)).toBe('sig-123-feature--s3');
    });

    test('stripNodeSuffix keeps the version suffix', () => {
        expect(stripNodeSuffix('sig-123-feature--v2--s3')).toBe('sig-123-feature--v2');
    });

    test('getBaseBranchName strips both suffixes so every node of a task groups together', () => {
        expect(getBaseBranchName('sig-123-feature--s2')).toBe('sig-123-feature');
        expect(getBaseBranchName('sig-123-feature--v2--s3')).toBe('sig-123-feature');
    });

    test('extractBranchVersion reads through the node suffix', () => {
        expect(extractBranchVersion('sig-123-feature--v2--s3')).toBe(2);
        expect(extractBranchVersion('sig-123-feature--s3')).toBe(1);
    });

    test('a branch containing --s digits mid-name is not treated as a node', () => {
        expect(extractNodeIndex('sig-123--s2-feature')).toBe(1);
        expect(getBaseBranchName('sig-123--s2-feature')).toBe('sig-123--s2-feature');
    });
});

describe('incrementBranchVersion', () => {
    test('adds --v2 to branch without version suffix', () => {
        expect(incrementBranchVersion('sig-123-feature')).toBe('sig-123-feature--v2');
    });

    test('increments --v2 to --v3', () => {
        expect(incrementBranchVersion('sig-123-feature--v2')).toBe('sig-123-feature--v3');
    });

    test('increments --v9 to --v10', () => {
        expect(incrementBranchVersion('sig-123-feature--v9')).toBe('sig-123-feature--v10');
    });
});

describe('areSameBranchVersions', () => {
    test('returns true for same branch without versions', () => {
        expect(areSameBranchVersions('sig-123-feature', 'sig-123-feature')).toBe(true);
    });

    test('returns true for same branch with different versions', () => {
        expect(areSameBranchVersions('sig-123-feature', 'sig-123-feature--v2')).toBe(true);
        expect(areSameBranchVersions('sig-123-feature--v2', 'sig-123-feature--v3')).toBe(true);
    });

    test('returns false for different branches', () => {
        expect(areSameBranchVersions('sig-123-feature', 'sig-456-feature')).toBe(false);
    });

    test('returns false for different branches with versions', () => {
        expect(areSameBranchVersions('sig-123-feature--v2', 'sig-456-feature--v2')).toBe(false);
    });
});

describe('determineNextVersion', () => {
    test('returns base name when no existing branches', () => {
        expect(determineNextVersion('sig-123-feature', [])).toBe('sig-123-feature');
    });

    test('returns --v2 when only v1 exists', () => {
        expect(determineNextVersion('sig-123-feature', ['sig-123-feature'])).toBe('sig-123-feature--v2');
    });

    test('returns --v3 when v1 and v2 exist', () => {
        expect(determineNextVersion('sig-123-feature--v2', ['sig-123-feature', 'sig-123-feature--v2'])).toBe(
            'sig-123-feature--v3',
        );
    });

    test('returns --v4 when v1, v2, and v3 exist', () => {
        expect(
            determineNextVersion('sig-123-feature--v3', [
                'sig-123-feature',
                'sig-123-feature--v2',
                'sig-123-feature--v3',
            ]),
        ).toBe('sig-123-feature--v4');
    });

    test('handles non-sequential versions correctly', () => {
        // If v1 and v3 exist but v2 was never created, should create v4
        expect(determineNextVersion('sig-123-feature--v3', ['sig-123-feature', 'sig-123-feature--v3'])).toBe(
            'sig-123-feature--v4',
        );
    });

    test('ignores branches with different base names', () => {
        expect(
            determineNextVersion('sig-123-feature', ['sig-123-feature', 'sig-456-feature', 'sig-456-feature--v2']),
        ).toBe('sig-123-feature--v2');
    });

    test('handles case where base branch has no version suffix but highest version exists', () => {
        expect(determineNextVersion('sig-123-feature', ['sig-123-feature', 'sig-123-feature--v2'])).toBe(
            'sig-123-feature--v3',
        );
    });
});
