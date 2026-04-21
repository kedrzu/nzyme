import { expect, it } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import { extractIssueIdFromBranch } from './extractIssueIdFromBranch.js';

it('should extract issue ID from simple branch names', () => {
    expect(extractIssueIdFromBranch('MYPROJECT-123')).toBe('MYPROJECT-123');
    expect(extractIssueIdFromBranch('PRJ-456')).toBe('PRJ-456');
    expect(extractIssueIdFromBranch('ABC-789')).toBe('ABC-789');
});

it('should extract issue ID from branch names with double dash separator', () => {
    expect(extractIssueIdFromBranch('MYPROJECT-123--feature-name')).toBe('MYPROJECT-123');
    expect(extractIssueIdFromBranch('PRJ-456--fix-bug')).toBe('PRJ-456');
    expect(extractIssueIdFromBranch('ABC-789--implement-new-feature')).toBe('ABC-789');
});

it('should extract issue ID from feature branch names', () => {
    expect(extractIssueIdFromBranch('feature/MYPROJECT-123--something')).toBe('MYPROJECT-123');
    expect(extractIssueIdFromBranch('feature/PRJ-456')).toBe('PRJ-456');
    expect(extractIssueIdFromBranch('fix/MYPROJECT-12A')).toBe('MYPROJECT-12A');
    expect(extractIssueIdFromBranch('bugfix/ABC-789--urgent-fix')).toBe('ABC-789');
});

it('should only match uppercase issue IDs', () => {
    expect(extractIssueIdFromBranch('MYPROJECT-123')).toBe('MYPROJECT-123');
    expect(extractIssueIdFromBranch('feature/PROJ-456')).toBe('PROJ-456');
    expect(extractIssueIdFromBranch('hotfix/TASK-789--critical')).toBe('TASK-789');
    expect(extractIssueIdFromBranch('PATIENT-APP-D')).toBe('PATIENT-APP-D');
});

it('should throw UsageError for lowercase issue IDs', () => {
    expect(() => extractIssueIdFromBranch('project-123')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('task-456--feature')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('feature/bug-789')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('myproject-123')).toThrow(UsageError);
});

it('should extract issue ID from complex branch structures', () => {
    expect(extractIssueIdFromBranch('hotfix/PROJ-123--critical-security-fix')).toBe('PROJ-123');
    expect(extractIssueIdFromBranch('release/v1.2.3/PROJ-456--prepare-release')).toBe('PROJ-456');
    expect(extractIssueIdFromBranch('user/john.doe/TASK-789--implement-feature')).toBe('TASK-789');
});

it('should handle branch names with numbers in project code', () => {
    expect(extractIssueIdFromBranch('PROJECT2-123')).toBe('PROJECT2-123');
    expect(extractIssueIdFromBranch('P1-456--feature')).toBe('P1-456');
    expect(extractIssueIdFromBranch('feature/V2-789')).toBe('V2-789');
});

it('should handle branch names with alphanumeric project codes', () => {
    expect(extractIssueIdFromBranch('ABC123-456')).toBe('ABC123-456');
    expect(extractIssueIdFromBranch('X1Y2Z3-789--fix')).toBe('X1Y2Z3-789');
    expect(extractIssueIdFromBranch('feature/A1B2-123')).toBe('A1B2-123');
});

it('should extract the first matching pattern when multiple patterns exist', () => {
    expect(extractIssueIdFromBranch('PROJ-123--with-ANOTHER-456')).toBe('PROJ-123');
    expect(extractIssueIdFromBranch('feature/FIRST-123/SECOND-456')).toBe('FIRST-123');
});

it('should handle branch names with special characters in description', () => {
    expect(extractIssueIdFromBranch('PROJ-123--fix_bug-with-special@chars')).toBe('PROJ-123');
    expect(extractIssueIdFromBranch('TASK-456--implement.new.feature')).toBe('TASK-456');
});

it('should throw UsageError for branch names without issue ID', () => {
    expect(() => extractIssueIdFromBranch('main')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('develop')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('release/v1.2.3')).toThrow(UsageError);
});

it('should throw UsageError for invalid issue ID formats', () => {
    expect(() => extractIssueIdFromBranch('123')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('ABC')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('feature/123')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('fix/ABC')).toThrow(UsageError);
});

it('should throw UsageError for branch names with only separators', () => {
    expect(() => extractIssueIdFromBranch('--')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('---')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('feature/--')).toThrow(UsageError);
});

it('should throw UsageError for empty or whitespace-only branch names', () => {
    expect(() => extractIssueIdFromBranch('')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch(' ')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('   ')).toThrow(UsageError);
});

it('should include helpful error message when failing', () => {
    const branchName = 'invalid-branch-name';

    expect(() => extractIssueIdFromBranch(branchName)).toThrow(
        `Could not extract issue ID from branch name "${branchName}". ` +
            'Branch name should contain a Sentry issue ID (e.g., MYPROJECT-123).',
    );
});

it('should handle branch names with hyphens in various positions', () => {
    expect(extractIssueIdFromBranch('MY-PROJECT-123')).toBe('MY-PROJECT-123');
    expect(extractIssueIdFromBranch('MULTI-WORD-PROJECT-456--feature')).toBe('MULTI-WORD-PROJECT-456');
    expect(extractIssueIdFromBranch('feature/X-Y-Z-789')).toBe('X-Y-Z-789');
});

it('should handle branch names starting with issue ID', () => {
    expect(extractIssueIdFromBranch('PROJ-123--additional_text')).toBe('PROJ-123');
    expect(extractIssueIdFromBranch('TASK-456--more_text')).toBe('TASK-456');
    expect(extractIssueIdFromBranch('BUG-789--extra.text')).toBe('BUG-789');
});

it('should throw UsageError for ambiguous patterns with hyphens', () => {
    expect(() => extractIssueIdFromBranch('PROJ-123-additional-text')).toThrow(UsageError);
    expect(() => extractIssueIdFromBranch('TASK-456-more-text')).toThrow(UsageError);
});
