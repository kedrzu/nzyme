import { expect, it } from 'vitest';

import { parseDuration } from './parseDuration.js';

it('parses full ISO duration', () => {
    expect(parseDuration('P1Y2M3DT4H5M6S')).toEqual({
        years: 1,
        months: 2,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
    });
});

it('parses duration with only date part', () => {
    expect(parseDuration('P2Y3M4D')).toEqual({
        years: 2,
        months: 3,
        days: 4,
    });
});

it('parses duration with only time part', () => {
    expect(parseDuration('PT5H6M7S')).toEqual({
        hours: 5,
        minutes: 6,
        seconds: 7,
    });
});

it('parses duration with some units missing', () => {
    expect(parseDuration('P1Y')).toEqual({ years: 1 });
    expect(parseDuration('P1Y2M')).toEqual({ years: 1, months: 2 });
    expect(parseDuration('PT10M')).toEqual({ minutes: 10 });
    expect(parseDuration('PT0S')).toEqual({ seconds: 0 });
});

it('parses duration with decimal seconds', () => {
    expect(parseDuration('PT1.5S')).toEqual({ seconds: 1.5 });
});

it('returns empty object for P and PT', () => {
    expect(parseDuration('P')).toEqual({});
    expect(parseDuration('PT')).toEqual({});
});

it('returns { seconds: 0 } for PT0S', () => {
    expect(parseDuration('PT0S')).toEqual({ seconds: 0 });
});

it('throws on invalid ISO string', () => {
    expect(() => parseDuration('1Y2M')).toThrow();
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('foo')).toThrow();
});

it('throws on non-string input', () => {
    // @ts-expect-error test
    expect(() => parseDuration(123)).toThrow();
    // @ts-expect-error test
    expect(() => parseDuration(null)).toThrow();
    // @ts-expect-error test
    expect(() => parseDuration(undefined)).toThrow();
});

it('parses duration with days divisible by 7 as weeks', () => {
    expect(parseDuration('P7D')).toEqual({ weeks: 1 });
    expect(parseDuration('P14D')).toEqual({ weeks: 2 });
    expect(parseDuration('P21D')).toEqual({ weeks: 3 });
});

it('parses duration with days not divisible by 7 as days', () => {
    expect(parseDuration('P8D')).toEqual({ days: 8 });
    expect(parseDuration('P15D')).toEqual({ days: 15 });
});
