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
        suites: {},
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
        suites: { e2e: { patterns: ['**/*.spec.ts'], traced: true, fullRunTriggers: ['playwright.config.ts'] } },
    };
    expect(parseAffectedConfig(full)).toEqual(full);

    const expected: AffectedConfig = {
        baseBranches: ['main'],
        aliases: [],
        rewrites: [],
        fullRunTriggers: [],
        ignore: ['docs/**'],
        suites: {
            unit: { patterns: ['*.test.ts'], traced: false, fullRunTriggers: [] },
            e2e: { traced: true, fullRunTriggers: [] },
        },
    };
    expect(
        parseAffectedConfig({
            ignore: ['docs/**'],
            suites: { unit: { patterns: ['*.test.ts'] }, e2e: { traced: true } },
        }),
    ).toEqual(expected);
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
        [{ suites: { e2e: { patterns: [] } } }, '`nzyme.affected.suites.e2e.patterns` must be a non-empty array'],
        [
            { suites: { e2e: { patterns: ['*'], traced: 'yes' } } },
            '`nzyme.affected.suites.e2e.traced` must be a boolean',
        ],
        [{ suites: { '../e2e': { patterns: ['*'] } } }, '`nzyme.affected.suites.../e2e` must be named'],
    ];

    for (const [value, message] of cases) {
        expect(() => parseAffectedConfig(value)).toThrow(message);
    }
});
