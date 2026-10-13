import { expect, test } from 'bun:test';

import type { SubmodulePrLink } from './upsertSubmodulePrLinks.js';
import { upsertSubmodulePrLinks } from './upsertSubmodulePrLinks.js';

const nzymePr: SubmodulePrLink = {
    submodule: 'nzyme',
    owner: 'kedrzu',
    repo: 'nzyme',
    number: 217,
    title: 'feat(github-cli): link submodule PRs',
    url: 'https://github.com/kedrzu/nzyme/pull/217',
};

const skillsPr: SubmodulePrLink = {
    submodule: 'skills',
    owner: 'kedrzu',
    repo: 'skills',
    number: 42,
    title: 'Add the playwright plugin',
    url: 'https://github.com/kedrzu/skills/pull/42',
};

const header = '# [HLD-613](https://linear.app/healed/issue/HLD-613) Add submodule PR links\n';
const changeset = '<!-- changeset-start -->\n## Changes\n\n- did things\n<!-- changeset-end -->';

test('appends the block after a blank line, leaving the existing description intact', () => {
    expect(upsertSubmodulePrLinks(header, [nzymePr])).toBe(
        `${header}\n` +
            '<!-- submodule-prs-start -->\n' +
            '## Submodule PRs\n' +
            '\n' +
            '- **nzyme**: [kedrzu/nzyme#217](https://github.com/kedrzu/nzyme/pull/217) feat(github-cli): link submodule PRs\n' +
            '<!-- submodule-prs-end -->',
    );
});

test('a description without a trailing newline still gets a blank line before the block', () => {
    const result = upsertSubmodulePrLinks('Some text', [nzymePr]);

    expect(result?.startsWith('Some text\n\n<!-- submodule-prs-start -->\n')).toBe(true);
});

test('a null or empty description becomes the block alone', () => {
    const fromNull = upsertSubmodulePrLinks(null, [nzymePr]);

    expect(fromNull?.startsWith('<!-- submodule-prs-start -->')).toBe(true);
    expect(upsertSubmodulePrLinks('', [nzymePr])).toBe(fromNull);
});

test('nothing to link and no block yet leaves the description alone', () => {
    expect(upsertSubmodulePrLinks(header, [])).toBeNull();
    expect(upsertSubmodulePrLinks(null, [])).toBeNull();
});

test('rewriting an existing block keeps the text around it byte-for-byte', () => {
    const before = `${header}\r\nWritten by a human.\r\n\r\n`;
    const after = `\r\n\r\n${changeset}\r\nTrailing note`;
    const body = `${before}${upsertSubmodulePrLinks(null, [nzymePr])}${after}`;

    const result = upsertSubmodulePrLinks(body, [nzymePr, skillsPr]);

    expect(result?.startsWith(before)).toBe(true);
    expect(result?.endsWith(after)).toBe(true);
    expect(result).toContain(
        '- **skills**: [kedrzu/skills#42](https://github.com/kedrzu/skills/pull/42) Add the playwright plugin\n<!-- submodule-prs-end -->',
    );
});

test('a link no longer found is kept — a submodule PR merged first must stay linked', () => {
    const body = upsertSubmodulePrLinks(header, [nzymePr, skillsPr]);

    expect(upsertSubmodulePrLinks(body, [skillsPr])).toBeNull();
    expect(upsertSubmodulePrLinks(body, [])).toBeNull();
});

test('a renamed PR overwrites its own line in place, new links go after the existing ones', () => {
    const body = upsertSubmodulePrLinks(header, [nzymePr]);
    const renamed = { ...nzymePr, title: 'feat(github-cli): renamed' };

    const result = upsertSubmodulePrLinks(body, [skillsPr, renamed]);

    expect(result).toBe(
        `${header}\n` +
            '<!-- submodule-prs-start -->\n' +
            '## Submodule PRs\n' +
            '\n' +
            '- **nzyme**: [kedrzu/nzyme#217](https://github.com/kedrzu/nzyme/pull/217) feat(github-cli): renamed\n' +
            '- **skills**: [kedrzu/skills#42](https://github.com/kedrzu/skills/pull/42) Add the playwright plugin\n' +
            '<!-- submodule-prs-end -->',
    );
});

test('the same links again change nothing, so no update is sent', () => {
    const body = upsertSubmodulePrLinks(header, [nzymePr, skillsPr]);

    expect(upsertSubmodulePrLinks(body, [nzymePr, skillsPr])).toBeNull();
});

test('a line inside the block that is not ours is kept as written', () => {
    const body = '<!-- submodule-prs-start -->\n## Submodule PRs\n\n  * hand-written note\n<!-- submodule-prs-end -->';

    expect(upsertSubmodulePrLinks(body, [nzymePr])).toBe(
        '<!-- submodule-prs-start -->\n' +
            '## Submodule PRs\n' +
            '\n' +
            '  * hand-written note\n' +
            '- **nzyme**: [kedrzu/nzyme#217](https://github.com/kedrzu/nzyme/pull/217) feat(github-cli): link submodule PRs\n' +
            '<!-- submodule-prs-end -->',
    );
});

test('mismatched markers refuse rather than rewrite a span that may hold human text', () => {
    expect(() => upsertSubmodulePrLinks(`${header}<!-- submodule-prs-start -->\nrest`, [nzymePr])).toThrow();
    expect(() =>
        upsertSubmodulePrLinks('<!-- submodule-prs-end -->\ntext\n<!-- submodule-prs-start -->', [nzymePr]),
    ).toThrow();
});
