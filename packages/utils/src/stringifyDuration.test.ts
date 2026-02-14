import { expect, it } from 'vitest';

import { stringifyDuration } from './stringifyDuration.js';

it('returns P for empty object', () => {
    expect(stringifyDuration({})).toBe('P');
});

it('stringifies only years', () => {
    expect(stringifyDuration({ years: 2 })).toBe('P2Y');
});

it('stringifies only months', () => {
    expect(stringifyDuration({ months: 3 })).toBe('P3M');
});

it('stringifies only days', () => {
    expect(stringifyDuration({ days: 4 })).toBe('P4D');
});

it('stringifies only hours', () => {
    expect(stringifyDuration({ hours: 5 })).toBe('PT5H');
});

it('stringifies only minutes', () => {
    expect(stringifyDuration({ minutes: 6 })).toBe('PT6M');
});

it('stringifies only seconds', () => {
    expect(stringifyDuration({ seconds: 7 })).toBe('PT7S');
});

it('stringifies full date part', () => {
    expect(stringifyDuration({ years: 1, months: 2, days: 3 })).toBe('P1Y2M3D');
});

it('stringifies full time part', () => {
    expect(stringifyDuration({ hours: 4, minutes: 5, seconds: 6 })).toBe('PT4H5M6S');
});

it('stringifies full duration', () => {
    expect(stringifyDuration({ years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 })).toBe(
        'P1Y2M3DT4H5M6S',
    );
});

it('stringifies mixed date and time', () => {
    expect(stringifyDuration({ years: 1, minutes: 10 })).toBe('P1YT10M');
    expect(stringifyDuration({ days: 2, seconds: 30 })).toBe('P2DT30S');
});

it('handles zero values', () => {
    expect(stringifyDuration({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(
        'P0Y0M0DT0H0M0S',
    );
    expect(stringifyDuration({ years: 0 })).toBe('P0Y');
    expect(stringifyDuration({ hours: 0 })).toBe('PT0H');
});

it('throws on invalid input', () => {
    // @ts-expect-error Testing null input throws error
    expect(() => stringifyDuration(null)).toThrow();
    // @ts-expect-error Testing undefined input throws error
    expect(() => stringifyDuration(undefined)).toThrow();
    // @ts-expect-error Testing number input throws error
    expect(() => stringifyDuration(123)).toThrow();
    // @ts-expect-error Testing string input throws error
    expect(() => stringifyDuration('P1Y')).toThrow();
});

it('stringifies only weeks', () => {
    expect(stringifyDuration({ weeks: 2 })).toBe('P14D');
});

it('stringifies weeks and days', () => {
    expect(stringifyDuration({ weeks: 1, days: 3 })).toBe('P10D');
    expect(stringifyDuration({ weeks: 0, days: 5 })).toBe('P5D');
});

it('stringifies weeks with other units', () => {
    expect(stringifyDuration({ years: 1, weeks: 2, hours: 5 })).toBe('P1Y14DT5H');
    expect(stringifyDuration({ months: 1, weeks: 1, minutes: 30 })).toBe('P1M7DT30M');
});

it('handles zero and negative weeks', () => {
    expect(stringifyDuration({ weeks: 0 })).toBe('P0D');
    expect(stringifyDuration({ weeks: -1 })).toBe('P-7D');
    expect(stringifyDuration({ weeks: -1, days: 10 })).toBe('P3D');
});
