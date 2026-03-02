import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import { extractTaskIdFromBranch } from './extractTaskIdFromBranch.js';

test('should extract task ID from simple branch names', () => {
    expect(extractTaskIdFromBranch('SIG-123')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('TEAM-456')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('ABC-999')).toBe('ABC-999');
});

test('should extract task ID from branch names with feature descriptions', () => {
    expect(extractTaskIdFromBranch('SIG-123-feature-name')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('TEAM-456-implement-auth')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('ABC-999-fix-bug')).toBe('ABC-999');
});

test('should extract task ID from branch names with prefixes', () => {
    expect(extractTaskIdFromBranch('feature/SIG-123-something')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('fix/TEAM-456')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('hotfix/ABC-999-urgent')).toBe('ABC-999');
    expect(extractTaskIdFromBranch('bugfix/DEV-111-quick-fix')).toBe('DEV-111');
});

test('should extract task ID from branch names with various separators', () => {
    expect(extractTaskIdFromBranch('fix.TEAM-456.issue')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('branch-ABC-999-name')).toBe('ABC-999');
    expect(extractTaskIdFromBranch('feature/SIG-123 description')).toBe('SIG-123');
});

test('should extract first task ID when multiple are present', () => {
    expect(extractTaskIdFromBranch('SIG-123-and-TEAM-456')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('feature/ABC-111-relates-to-DEF-222')).toBe('ABC-111');
});

test('should work with different team prefixes and numbers', () => {
    expect(extractTaskIdFromBranch('A-1')).toBe('A-1');
    expect(extractTaskIdFromBranch('VERYLONGTEAM-99999')).toBe('VERYLONGTEAM-99999');
    expect(extractTaskIdFromBranch('PROJECT-0001')).toBe('PROJECT-0001');
});

test('should extract task ID from middle of branch name', () => {
    expect(extractTaskIdFromBranch('prefix-SIG-123-suffix')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('feature/some-TEAM-456-description')).toBe('TEAM-456');
});

test('should throw UsageError when no task ID is found', () => {
    expect(() => extractTaskIdFromBranch('feature-branch')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('main')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('develop')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('hotfix/important-fix')).toThrow(UsageError);
});

test('should throw UsageError for invalid task ID formats', () => {
    expect(() => extractTaskIdFromBranch('SIG123')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('SIG-')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('123-SIG')).toThrow(UsageError);
});

test('should convert lowercase task IDs to uppercase', () => {
    expect(extractTaskIdFromBranch('sig-123')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('team-456')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('abc-999')).toBe('ABC-999');
});

test('should convert lowercase task IDs to uppercase in complex branch names', () => {
    expect(extractTaskIdFromBranch('feature/sig-123-something')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('fix/team-456')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('hotfix/abc-999-urgent')).toBe('ABC-999');
    expect(extractTaskIdFromBranch('sig-123-feature-name')).toBe('SIG-123');
});

test('should handle mixed case task IDs', () => {
    expect(extractTaskIdFromBranch('Sig-123')).toBe('SIG-123');
    expect(extractTaskIdFromBranch('TeAm-456')).toBe('TEAM-456');
    expect(extractTaskIdFromBranch('feature/AbC-999-fix')).toBe('ABC-999');
});

test('should throw UsageError for branch names with underscores around task ID', () => {
    // Underscores are not supported as separators due to word boundary regex
    expect(() => extractTaskIdFromBranch('feature_SIG-123_description')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('_ABC-999_')).toThrow(UsageError);
});

test('should throw UsageError for empty or whitespace strings', () => {
    expect(() => extractTaskIdFromBranch('')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('   ')).toThrow(UsageError);
    expect(() => extractTaskIdFromBranch('\n\t')).toThrow(UsageError);
});

test('should throw UsageError with descriptive message', () => {
    expect(() => extractTaskIdFromBranch('invalid-branch')).toThrow(
        'Could not extract task ID from branch name "invalid-branch". Branch name should contain a Linear task ID (e.g., SIG-123).',
    );
});
