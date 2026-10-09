import { expect, test } from 'bun:test';

import type { BumpChanged } from './bumpSubmodule.js';
import { MAX_LISTED_COMMITS, renderBumpSummary } from './renderBumpSummary.js';

const PREVIOUS = 'a'.repeat(40);
const CURRENT = 'b'.repeat(40);

test('links commits and the comparison on GitHub and qualifies issue references', () => {
    const summary = renderBumpSummary(
        bump({
            commits: [{ sha: CURRENT, subject: 'feat(cli): add a thing (#196)' }],
            repoUrl: 'https://github.com/kedrzu/nzyme',
        }),
    );

    expect(summary).toBe(
        [
            '## `nzyme`: `aaaaaaa` → `bbbbbbb`',
            '',
            `Source: \`origin/main\` · [compare](https://github.com/kedrzu/nzyme/compare/${PREVIOUS}...${CURRENT})`,
            '',
            '1 new commit(s):',
            '',
            `- [\`bbbbbbb\`](https://github.com/kedrzu/nzyme/commit/${CURRENT}) feat(cli): add a thing (kedrzu/nzyme#196)`,
            '',
        ].join('\n'),
    );
});

test('lists plain SHAs without a GitHub remote', () => {
    const summary = renderBumpSummary(bump({ commits: [{ sha: CURRENT, subject: 'fix: x (#1)' }] }));

    expect(summary).not.toContain('compare');
    expect(summary).toContain('- `bbbbbbb` fix: x (#1)\n');
});

test('caps the commit list', () => {
    const commits = Array.from({ length: MAX_LISTED_COMMITS + 5 }, (_, index) => ({
        sha: String(index).padStart(40, '0'),
        subject: `chore: commit ${index}`,
    }));

    const summary = renderBumpSummary(bump({ commits, repoUrl: 'https://github.com/kedrzu/nzyme' }));

    expect(summary).toContain(`${MAX_LISTED_COMMITS + 5} new commit(s):`);
    expect(summary).toContain(`chore: commit ${MAX_LISTED_COMMITS - 1}\n`);
    expect(summary).not.toContain(`chore: commit ${MAX_LISTED_COMMITS}\n`);
    expect(summary).toContain('- … and 5 more — see [the full comparison]');
});

test('warns when the bump drops commits of the previous pin', () => {
    const summary = renderBumpSummary(bump({ droppedCount: 2 }));

    expect(summary).toContain('> [!WARNING]');
    expect(summary).toContain('2 commit(s) of the previous');
});

function bump(overrides: Partial<BumpChanged>): BumpChanged {
    return {
        changed: true,
        submodulePath: 'nzyme',
        source: 'origin/main',
        previous: PREVIOUS,
        current: CURRENT,
        commits: [],
        droppedCount: 0,
        repoUrl: null,
        ...overrides,
    };
}
