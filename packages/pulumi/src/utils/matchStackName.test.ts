import { describe, expect, test } from 'bun:test';

import { matchStackName } from './matchStackName.js';

describe('matchStackName', () => {
    test('exact match when there is no wildcard', () => {
        expect(matchStackName('dns-global', 'dns-global')).toBe(true);
        expect(matchStackName('dns-global', 'database-eu-central-1')).toBe(false);
    });

    test('* matches any sequence', () => {
        expect(matchStackName('*-global', 'dns-global')).toBe(true);
        expect(matchStackName('*-eu-central-1', 'database-eu-central-1')).toBe(true);
        expect(matchStackName('*-eu-central-1', 'dns-global')).toBe(false);
        expect(matchStackName('database-*', 'database-eu-central-1')).toBe(true);
    });

    test('the legacy + wildcard still works', () => {
        expect(matchStackName('core+', 'coreApi')).toBe(true);
        expect(matchStackName('core+', 'core')).toBe(false);
    });

    test('other regex metacharacters are matched literally', () => {
        expect(matchStackName('a.b', 'a.b')).toBe(true);
        expect(matchStackName('a.b', 'axb')).toBe(false);
    });
});
