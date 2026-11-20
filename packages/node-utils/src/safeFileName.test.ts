import { expect, test } from 'bun:test';

import { safeFileName } from './safeFileName.js';

test('replaces separators and characters illegal on disk', () => {
    expect(safeFileName('Q1/Q2: plan?.xlsx', 'download')).toBe('Q1_Q2_ plan_.xlsx');
    expect(safeFileName('2025-FP/I/27707.pdf', 'download')).toBe('2025-FP_I_27707.pdf');
});

test('replaces control characters', () => {
    expect(safeFileName('a\u0007b\nc.txt', 'download')).toBe('a_b_c.txt');
});

test('turns leading dots into one underscore, so no hidden file and no ..', () => {
    expect(safeFileName('..env', 'download')).toBe('_env');
    expect(safeFileName('.bashrc', 'download')).toBe('_bashrc');
    expect(safeFileName('../../.bashrc', 'download')).toBe('__.._.bashrc');
    expect(safeFileName('..', 'download')).toBe('_');
    expect(safeFileName(' ..', 'download')).toBe('_');
    expect(safeFileName(' .env', 'download')).toBe('_env');
    expect(safeFileName('.', 'download')).toBe('_');
});

test('falls back when nothing is left', () => {
    expect(safeFileName('  ', 'attachment')).toBe('attachment');
    expect(safeFileName('', 'download')).toBe('download');
});
