import { expect, test } from 'bun:test';

import type { AffectedConfig } from './AffectedConfig.js';
import { parseAffectedConfig } from './AffectedConfig.js';

test('a missing config is the defaults', () => {
    const expected: AffectedConfig = {
        baseBranches: ['main'],
        aliases: [],
        rewrites: [],
        fullRunTriggers: [],
        ignore: [],
    };
    expect(parseAffectedConfig(undefined)).toEqual(expected);
});

test('parses a full config, keeping the defaults for absent fields', () => {
    const full = {
        baseBranches: ['main', 'release'],
        aliases: [{ prefix: '@/', packages: ['@acme/app'] }],
        rewrites: [{ from: '.loc.yaml', to: '.loc.ts' }],
        fullRunTriggers: ['bun.lock'],
        ignore: ['**/*.md'],
    };
    expect(parseAffectedConfig(full)).toEqual(full);

    const expected: AffectedConfig = {
        baseBranches: ['main'],
        aliases: [],
        rewrites: [],
        fullRunTriggers: [],
        ignore: ['docs/**'],
    };
    expect(parseAffectedConfig({ ignore: ['docs/**'] })).toEqual(expected);
});

test('a malformed config throws, naming the offending path', () => {
    const cases: [unknown, string][] = [
        ['main', '`nzyme.affected` must be an object'],
        [{ baseBranches: 'main' }, '`nzyme.affected.baseBranches` must be an array of strings'],
        [{ baseBranches: [] }, '`nzyme.affected.baseBranches` must be a non-empty array'],
        [
            { aliases: [{ prefix: '@/', packages: [1] }] },
            '`nzyme.affected.aliases[0].packages[0]` must be a non-empty string',
        ],
        [{ rewrites: [{ from: '.a' }] }, '`nzyme.affected.rewrites[0].to` must be a non-empty string'],
        [{ rewrites: {} }, '`nzyme.affected.rewrites` must be an array'],
        [{ ignore: ['ok', ''] }, '`nzyme.affected.ignore[1]` must be a non-empty string'],
    ];

    for (const [value, message] of cases) {
        expect(() => parseAffectedConfig(value)).toThrow(message);
    }
});
