import { expect, test } from 'vitest';

import { createIssueIdRegex } from './findMatchingPr.js';

test('should match exact issue ID', () => {
    const regex = createIssueIdRegex('SIG-123');

    expect(regex.test('[SIG-123] Fix user authentication')).toBe(true);
    expect(regex.test('feat/SIG-123-implement-auth')).toBe(true);
    expect(regex.test('SIG-123')).toBe(true);
});

test('should not match partial issue ID', () => {
    const regex = createIssueIdRegex('SIG-12');

    // These should NOT match SIG-12
    expect(regex.test('SIG-123')).toBe(false);
    expect(regex.test('SIG-1234')).toBe(false);
    expect(regex.test('[SIG-123] Fix user authentication')).toBe(false);
    expect(regex.test('feat/SIG-123-implement-auth')).toBe(false);
});

test('should match issue ID with various delimiters', () => {
    const regex = createIssueIdRegex('SIG-123');

    expect(regex.test('[SIG-123] Title')).toBe(true);
    expect(regex.test('(SIG-123) Title')).toBe(true);
    expect(regex.test('feat/SIG-123-auth')).toBe(true);
    expect(regex.test('SIG-123.branch')).toBe(true);
    expect(regex.test('fix_SIG-123_issue')).toBe(true);
    expect(regex.test('hotfix: SIG-123')).toBe(true);
    expect(regex.test('SIG-123,')).toBe(true);
    expect(regex.test('SIG-123;')).toBe(true);
});

test('should be case insensitive', () => {
    const regex = createIssueIdRegex('SIG-123');

    expect(regex.test('[sig-123] Title')).toBe(true);
    expect(regex.test('FEAT/SIG-123-AUTH')).toBe(true);
    expect(regex.test('Sig-123')).toBe(true);
});

test('should handle issue IDs with special characters', () => {
    const regex = createIssueIdRegex('TEST-123');

    expect(regex.test('[TEST-123] Title')).toBe(true);
    expect(regex.test('feature/TEST-123-implementation')).toBe(true);

    // Should not match when part of a larger ID
    expect(regex.test('TEST-1234')).toBe(false);
    expect(regex.test('ATEST-123')).toBe(false);
});

test('should match at string boundaries', () => {
    const regex = createIssueIdRegex('ABC-999');

    // At beginning
    expect(regex.test('ABC-999 something')).toBe(true);
    expect(regex.test('ABC-999-branch')).toBe(true);

    // At end
    expect(regex.test('something ABC-999')).toBe(true);
    expect(regex.test('branch-ABC-999')).toBe(true);

    // Standalone
    expect(regex.test('ABC-999')).toBe(true);
});
