import { describe, expect, it } from 'bun:test';

import { GiB } from './byteUnits.js';
import { parseMeminfoAvailableBytes, parseVmStatAvailableBytes, readAvailableMemory } from './readAvailableMemory.js';

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                   258487.
Pages active:                                1111167.
Pages inactive:                              1073310.
Pages speculative:                             37176.
Pages throttled:                                   0.
Pages wired down:                             411849.
Pages purgeable:                               25453.
"Translation faults":                    17829742670.
`;

const MEMINFO = `MemTotal:       16384000 kB
MemFree:          500000 kB
MemAvailable:    8388608 kB
Buffers:          100000 kB
`;

describe('parseVmStatAvailableBytes', () => {
    it('sums free, inactive, speculative and purgeable pages times the parsed page size', () => {
        expect(parseVmStatAvailableBytes(VM_STAT)).toBe((258487 + 1073310 + 37176 + 25453) * 16384);
    });

    it('uses the page size from the header, not a constant', () => {
        const text = VM_STAT.replace('16384', '4096');

        expect(parseVmStatAvailableBytes(text)).toBe((258487 + 1073310 + 37176 + 25453) * 4096);
    });

    it('throws when the header is missing', () => {
        expect(() => parseVmStatAvailableBytes('Pages free: 1.')).toThrow('page size');
    });
});

describe('parseMeminfoAvailableBytes', () => {
    it('returns MemAvailable in bytes', () => {
        expect(parseMeminfoAvailableBytes(MEMINFO)).toBe(8 * GiB);
    });

    it('throws when MemAvailable is missing', () => {
        expect(() => parseMeminfoAvailableBytes('MemFree: 1 kB')).toThrow('MemAvailable');
    });
});

describe('readAvailableMemory', () => {
    it('reads a positive number on this machine', () => {
        expect(readAvailableMemory()).toBeGreaterThan(0);
    });
});
