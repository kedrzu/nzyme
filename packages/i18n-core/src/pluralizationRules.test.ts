import { expect, test } from 'bun:test';

import { pluralizationEn, pluralizationPl } from './pluralizationRules.js';

test('pluralizationPl follows the CLDR Polish rules for integers', () => {
    const plurals = { one: 'one', few: 'few', many: 'many' };
    const counts = [0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 102, 104, 111, 112, 114, 122, 124, 1012, 1022];

    expect(counts.map(count => [count, pluralizationPl.pluralize(count, plurals)])).toEqual([
        [0, 'many'],
        [1, 'one'],
        [2, 'few'],
        [4, 'few'],
        [5, 'many'],
        [11, 'many'],
        [12, 'many'],
        [14, 'many'],
        [21, 'many'],
        [22, 'few'],
        [24, 'few'],
        [25, 'many'],
        [102, 'few'],
        [104, 'few'],
        [111, 'many'],
        [112, 'many'],
        [114, 'many'],
        [122, 'few'],
        [124, 'few'],
        [1012, 'many'],
        [1022, 'few'],
    ]);
});

test('pluralizationPl uses the zero form for zero when there is one', () => {
    expect(pluralizationPl.pluralize(0, { zero: 'zero', one: 'one', few: 'few', many: 'many' })).toBe('zero');
});

test('pluralizationEn uses one for 1 only', () => {
    const plurals = { one: 'one', many: 'many' };

    expect([0, 1, 2, 11, 21, 101].map(count => pluralizationEn.pluralize(count, plurals))).toEqual([
        'many',
        'one',
        'many',
        'many',
        'many',
        'many',
    ]);
});
