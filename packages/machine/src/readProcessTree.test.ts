import { describe, expect, it } from 'bun:test';

import { getProcessStartTime, parseProcessTable, readProcessTable } from './readProcessTree.js';

const PS_OUTPUT = `
    1 Thu Oct 22 16:57:41 2026    
  250 Fri Oct 23 12:08:45 2026    
  900 Mon Nov  2 20:05:48 2026
`;

describe('parseProcessTable', () => {
    const table = parseProcessTable(PS_OUTPUT);

    it('parses a real macOS sample', () => {
        expect(table[0]).toEqual({ pid: 1, startTime: 'Thu Oct 22 16:57:41 2026' });
    });

    it('normalizes double spaces in lstart', () => {
        expect(getProcessStartTime(table, 900)).toBe('Mon Nov 2 20:05:48 2026');
    });

    it('throws on a malformed line', () => {
        expect(() => parseProcessTable('garbage')).toThrow('Unrecognized');
    });
});

describe('readProcessTable', () => {
    it('includes the current process', () => {
        expect(getProcessStartTime(readProcessTable(), process.pid)).toBeString();
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
