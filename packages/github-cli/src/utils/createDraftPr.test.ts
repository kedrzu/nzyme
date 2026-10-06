import { expect, test } from 'bun:test';

import { buildPrBody } from './createDraftPr.js';

test('the PR body opens with the heading, then a blank line and the description', () => {
    expect(buildPrBody('Details', 'HLD-1', 'https://linear.app/x/HLD-1', 'Fix login')).toBe(
        '# [HLD-1](https://linear.app/x/HLD-1) Fix login\n\nDetails',
    );
});

test('the PR body without a description is the heading and a trailing newline', () => {
    expect(buildPrBody('', 'HLD-1', 'https://linear.app/x/HLD-1', 'Fix login')).toBe(
        '# [HLD-1](https://linear.app/x/HLD-1) Fix login\n',
    );
});
