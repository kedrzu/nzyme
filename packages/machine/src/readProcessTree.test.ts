import { describe, expect, it } from 'bun:test';

import { getProcessStartTime, parseProcessTable, readProcessTable, sumProcessTreeRss } from './readProcessTree.js';

const PS_OUTPUT = `
    1     0  19856 Thu Oct 22 16:57:41 2026    
  250     1   4752 Fri Oct 23 12:08:45 2026    
  331     1  39824 Thu Oct 22 16:57:59 2026    
  333     1  11568 Thu Oct 22 16:57:59 2026    
  900   1   100 Mon Nov  2 20:05:48 2026
  901 900   200 Mon Nov  2 20:05:49 2026
  902 901   400 Mon Nov  2 20:05:50 2026
  903 1  800 Mon Nov  2 20:05:51 2026
`;

describe('parseProcessTable', () => {
    const table = parseProcessTable(PS_OUTPUT);

    it('parses a real macOS sample, converting KiB to bytes', () => {
        expect(table[0]).toEqual({ pid: 1, ppid: 0, rssBytes: 19856 * 1024, startTime: 'Thu Oct 22 16:57:41 2026' });
    });

    it('normalizes double spaces in lstart', () => {
        expect(getProcessStartTime(table, 900)).toBe('Mon Nov 2 20:05:48 2026');
    });

    it('throws on a malformed line', () => {
        expect(() => parseProcessTable('garbage')).toThrow('Unrecognized');
    });
});

describe('sumProcessTreeRss', () => {
    const table = parseProcessTable(PS_OUTPUT);

    it('counts the pid and all descendants only', () => {
        expect(sumProcessTreeRss(table, 900)).toBe((100 + 200 + 400) * 1024);
    });

    it('does not count siblings or ancestors', () => {
        expect(sumProcessTreeRss(table, 901)).toBe((200 + 400) * 1024);
    });

    it('returns 0 for an unknown pid', () => {
        expect(sumProcessTreeRss(table, 123456789)).toBe(0);
    });
});

describe('readProcessTable', () => {
    it('includes the current process with a positive rss', () => {
        const table = readProcessTable();

        expect(sumProcessTreeRss(table, process.pid)).toBeGreaterThan(0);
        expect(getProcessStartTime(table, process.pid)).toBeString();
    });

    it('reports a start time that does not depend on the timezone of the reader', () => {
        const inherited = process.env.TZ;

        try {
            process.env.TZ = 'Asia/Tokyo';
            const tokyo = getProcessStartTime(readProcessTable(), process.pid);
            process.env.TZ = 'America/New_York';
            const newYork = getProcessStartTime(readProcessTable(), process.pid);

            expect(tokyo).toBeDefined();
            expect(newYork).toBe(tokyo);
        } finally {
            if (inherited === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = inherited;
            }
        }
    });
});
