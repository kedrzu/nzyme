import { describe, expect, it } from 'bun:test';

import { formatDurationMs } from './formatDurationMs.js';

describe('milliseconds (< 1000ms)', () => {
    it('should format 0ms', () => {
        expect(formatDurationMs(0)).toBe('0.0ms');
    });

    it('should format milliseconds with 1 decimal place', () => {
        expect(formatDurationMs(500)).toBe('500.0ms');
        expect(formatDurationMs(123)).toBe('123.0ms');
        expect(formatDurationMs(999)).toBe('999.0ms');
    });

    it('should handle fractional milliseconds', () => {
        expect(formatDurationMs(500.5)).toBe('500.5ms');
        expect(formatDurationMs(123.9)).toBe('123.9ms');
    });
});

describe('seconds (1000ms - 59999ms)', () => {
    it('should format exact seconds with 3 decimal places', () => {
        expect(formatDurationMs(1000)).toBe('1.000s');
        expect(formatDurationMs(2000)).toBe('2.000s');
        expect(formatDurationMs(30000)).toBe('30.000s');
    });

    it('should format fractional seconds with 3 decimal places', () => {
        expect(formatDurationMs(1500)).toBe('1.500s');
        expect(formatDurationMs(1234)).toBe('1.234s');
        expect(formatDurationMs(59999)).toBe('59.999s');
    });

    it('should handle edge case at 59 seconds', () => {
        expect(formatDurationMs(59000)).toBe('59.000s');
        expect(formatDurationMs(59900)).toBe('59.900s');
    });
});

describe('minutes (60000ms - 3599999ms)', () => {
    it('should format exact minutes without seconds', () => {
        expect(formatDurationMs(60000)).toBe('1m');
        expect(formatDurationMs(120000)).toBe('2m');
        expect(formatDurationMs(1800000)).toBe('30m');
    });

    it('should format minutes with seconds', () => {
        expect(formatDurationMs(90000)).toBe('1m 30s'); // 90s = 1m 30s (truncated)
        expect(formatDurationMs(150000)).toBe('2m 30s'); // 150s = 2m 30s (truncated)
        expect(formatDurationMs(3570000)).toBe('59m 30s'); // 3570s = 59m 30s (truncated)
    });

    it('should omit seconds when they are 0', () => {
        expect(formatDurationMs(180000)).toBe('3m');
        expect(formatDurationMs(600000)).toBe('10m');
    });

    it('should handle fractional seconds (truncated)', () => {
        expect(formatDurationMs(90500)).toBe('1m 30s'); // 90.5s = 1m 30s (truncated)
        expect(formatDurationMs(90499)).toBe('1m 30s'); // 90.499s = 1m 30s (truncated)
        expect(formatDurationMs(91000)).toBe('1m 31s'); // 91s = 1m 31s exactly
    });
});

describe('hours (3600000ms+)', () => {
    it('should format exact hours without minutes or seconds', () => {
        expect(formatDurationMs(3600000)).toBe('1h');
        expect(formatDurationMs(7200000)).toBe('2h');
        expect(formatDurationMs(36000000)).toBe('10h');
    });

    it('should format hours with minutes only', () => {
        expect(formatDurationMs(5400000)).toBe('1h 30m'); // 5400s = 90m = 1h 30m (truncated)
        expect(formatDurationMs(9000000)).toBe('2h 30m'); // 9000s = 150m = 2h 30m (truncated)
    });

    it('should format hours with minutes and seconds', () => {
        expect(formatDurationMs(3630000)).toBe('1h 30s'); // 3630s = 1h 0m 30s, minutes omitted when 0
        expect(formatDurationMs(7260000)).toBe('2h 1m'); // 7260s = 2h 1m 0s, seconds omitted when 0
    });

    it('should format hours with both minutes and seconds', () => {
        expect(formatDurationMs(5430000)).toBe('1h 30m 30s'); // 5430s = 1h 30m 30s (truncated)
        expect(formatDurationMs(9090000)).toBe('2h 31m 30s'); // 9090s = 2h 31m 30s (truncated)
    });

    it('should omit minutes when they are 0', () => {
        expect(formatDurationMs(3630000)).toBe('1h 30s'); // 3630s = 1h 0m 30s, minutes omitted
        expect(formatDurationMs(7230000)).toBe('2h 30s'); // 7230s = 2h 0m 30s, minutes omitted
    });

    it('should omit seconds when they are 0', () => {
        expect(formatDurationMs(5400000)).toBe('1h 30m'); // 5400s = 1h 30m 0s, seconds omitted
        expect(formatDurationMs(9000000)).toBe('2h 30m'); // 9000s = 2h 30m 0s, seconds omitted
    });

    it('should handle large durations', () => {
        expect(formatDurationMs(86400000)).toBe('24h');
        expect(formatDurationMs(90061000)).toBe('25h 1m 1s');
    });

    it('should handle fractional minutes and seconds (truncated)', () => {
        expect(formatDurationMs(5430500)).toBe('1h 30m 30s'); // 5430.5s = 1h 30m 30s (truncated)
        expect(formatDurationMs(5430499)).toBe('1h 30m 30s'); // 5430.499s = 1h 30m 30s (truncated)
        expect(formatDurationMs(5431000)).toBe('1h 30m 31s'); // 5431s = 1h 30m 31s exactly
    });
});

describe('edge cases', () => {
    it('should handle boundary values correctly', () => {
        expect(formatDurationMs(999.9)).toBe('999.9ms');
        expect(formatDurationMs(1000)).toBe('1.000s');
        expect(formatDurationMs(59999)).toBe('59.999s');
        expect(formatDurationMs(60000)).toBe('1m');
        expect(formatDurationMs(3599999)).toBe('59m 59s'); // 3599.999s = 59m 59s (truncated)
        expect(formatDurationMs(3600000)).toBe('1h');
    });

    it('should handle very small durations', () => {
        expect(formatDurationMs(0.1)).toBe('0.1ms');
        expect(formatDurationMs(0.01)).toBe('0.0ms');
    });
});
