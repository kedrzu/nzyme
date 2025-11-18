import { expect, it } from 'vitest';

import type { Money } from './Money.js';
import { moneyToString } from './moneyToString.js';

it('converts PLN money to string with 2 decimal places', () => {
    const money: Money = [12345, 'PLN'];
    expect(moneyToString(money)).toBe('123.45');
});

it('converts EUR money to string with 2 decimal places', () => {
    const money: Money = [9999, 'EUR'];
    expect(moneyToString(money)).toBe('99.99');
});

it('converts USD money to string with 2 decimal places', () => {
    const money: Money = [54321, 'USD'];
    expect(moneyToString(money)).toBe('543.21');
});

it('handles zero amount', () => {
    const money: Money = [0, 'PLN'];
    expect(moneyToString(money)).toBe('0.00');
});

it('handles single digit amounts', () => {
    const money: Money = [1, 'EUR'];
    expect(moneyToString(money)).toBe('0.01');
});

it('handles amounts without decimal part', () => {
    const money: Money = [10000, 'USD'];
    expect(moneyToString(money)).toBe('100.00');
});

it('handles large amounts', () => {
    const money: Money = [123456789, 'PLN'];
    expect(moneyToString(money)).toBe('1234567.89');
});

it('handles amounts with only cents', () => {
    const money: Money = [99, 'EUR'];
    expect(moneyToString(money)).toBe('0.99');
});

it('preserves trailing zeros', () => {
    const money: Money = [100, 'PLN'];
    expect(moneyToString(money)).toBe('1.00');
});

it('preserves single trailing zero', () => {
    const money: Money = [110, 'USD'];
    expect(moneyToString(money)).toBe('1.10');
});

it('handles very small amounts', () => {
    const money: Money = [5, 'EUR'];
    expect(moneyToString(money)).toBe('0.05');
});

it('handles maximum safe integer', () => {
    const money: Money = [Number.MAX_SAFE_INTEGER, 'PLN'];
    expect(moneyToString(money)).toBe('90071992547409.91');
});
