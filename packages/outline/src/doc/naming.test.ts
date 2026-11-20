import { expect, test } from 'bun:test';

import { pickFreeName, slugify } from './naming.js';

test('slugify transliterates Polish letters and joins words with single hyphens', () => {
    expect(slugify('Zażółć gęślą jaźń')).toBe('zazolc-gesla-jazn');
    expect(slugify('ŁÓDŹ — Śląsk (2024)!')).toBe('lodz-slask-2024');
    expect(slugify('  --Oferta dla kliniki--  ')).toBe('oferta-dla-kliniki');
});

test('slugify falls back for a title that leaves nothing', () => {
    expect(slugify('🚀🚀')).toBe('untitled');
    expect(slugify('???', 'notatka')).toBe('notatka');
});

test('pickFreeName returns the name, then name-2, name-3, comparing case-insensitively', () => {
    expect(pickFreeName('oferta', [])).toBe('oferta');
    expect(pickFreeName('oferta', ['Oferta'])).toBe('oferta-2');
    expect(pickFreeName('oferta', ['OFERTA', 'oferta-2'])).toBe('oferta-3');
    expect(pickFreeName('oferta', ['oferta.md', 'Oferta-2.MD'], '.md')).toBe('oferta-3.md');
});
