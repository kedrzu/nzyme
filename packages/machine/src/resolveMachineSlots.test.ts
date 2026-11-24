import { expect, test } from 'bun:test';

import { resolveMachineSlots } from './resolveMachineSlots.js';

const GiB = 1024 ** 3;

test.each([
    [16 * GiB, 1],
    [32 * GiB, 1],
    [64 * GiB, 3],
    [128 * GiB, 6],
])('without NZYME_MACHINE_SLOTS, %d bytes of memory give %d slots', (totalBytes, slots) => {
    expect(resolveMachineSlots({}, totalBytes)).toBe(slots);
});

test('NZYME_MACHINE_SLOTS overrides the memory-based default', () => {
    expect(resolveMachineSlots({ NZYME_MACHINE_SLOTS: '5' }, 16 * GiB)).toBe(5);
});

test.each(['0', '-1', 'two', '1.5', ''])('an invalid NZYME_MACHINE_SLOTS (%p) falls back to the default', value => {
    expect(resolveMachineSlots({ NZYME_MACHINE_SLOTS: value }, 64 * GiB)).toBe(3);
});
