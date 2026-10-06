import { expect, test } from 'bun:test';

import { formatTaskPrTitle } from './formatTaskPrTitle.js';

test('a title without a project is tagged with the issue id only', () => {
    expect(formatTaskPrTitle({ issueId: 'HLD-1', title: 'Fix login' })).toBe('[HLD-1] Fix login');
});

test('a project name becomes a second tag', () => {
    expect(formatTaskPrTitle({ issueId: 'HLD-1', projectName: 'Auth', title: 'Fix login' })).toBe(
        '[HLD-1][Auth] Fix login',
    );
});

test('version 1 and an absent version add no suffix', () => {
    expect(formatTaskPrTitle({ issueId: 'HLD-1', title: 'Fix login', version: 1 })).toBe('[HLD-1] Fix login');
});

test('a reopened task appends its version after the title', () => {
    expect(formatTaskPrTitle({ issueId: 'HLD-1', projectName: 'Auth', title: 'Fix login', version: 2 })).toBe(
        '[HLD-1][Auth] Fix login (v2)',
    );
});
