import { expect, it } from 'bun:test';

import type { Money } from './Money.js';
import { moneyToNumber } from './moneyToNumber.js';

it('converts PLN money to number with 2 decimal places', () => {
    const money: Money = [12345, 'PLN'];
    expect(moneyToNumber(money)).toBe(123.45);
});

it('converts EUR money to number with 2 decimal places', () => {
    const money: Money = [9999, 'EUR'];
    expect(moneyToNumber(money)).toBe(99.99);
});

it('converts USD money to number with 2 decimal places', () => {
    const money: Money = [54321, 'USD'];
    expect(moneyToNumber(money)).toBe(543.21);
});

it('handles zero amount', () => {
    const money: Money = [0, 'PLN'];
    expect(moneyToNumber(money)).toBe(0);
});

it('handles single digit amounts', () => {
    const money: Money = [1, 'EUR'];
    expect(moneyToNumber(money)).toBe(0.01);
});

it('handles amounts without decimal part', () => {
    const money: Money = [10000, 'USD'];
    expect(moneyToNumber(money)).toBe(100);
});

it('handles large amounts', () => {
    const money: Money = [123456789, 'PLN'];
    expect(moneyToNumber(money)).toBe(1234567.89);
});

it('handles amounts with only cents', () => {
    const money: Money = [99, 'EUR'];
    expect(moneyToNumber(money)).toBe(0.99);
});

it('handles exact whole numbers', () => {
    const money: Money = [100, 'PLN'];
    expect(moneyToNumber(money)).toBe(1);
});

it('handles decimal values correctly', () => {
    const money: Money = [110, 'USD'];
    expect(moneyToNumber(money)).toBe(1.1);
});

it('handles very small amounts', () => {
    const money: Money = [5, 'EUR'];
    expect(moneyToNumber(money)).toBe(0.05);
});

it('handles maximum safe integer', () => {
    const money: Money = [Number.MAX_SAFE_INTEGER, 'PLN'];
    expect(moneyToNumber(money)).toBe(90071992547409.91);
});

it('returns number type for mathematical operations', () => {
    const money: Money = [10000, 'USD'];
    const result = moneyToNumber(money);
    expect(typeof result).toBe('number');
    expect(result * 2).toBe(200);
    expect(result + 50).toBe(150);
});
