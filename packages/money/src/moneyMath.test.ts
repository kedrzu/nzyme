import { expect, it } from 'bun:test';

import type { Money } from './Money.js';
import { assertCurrenciesMatch, moneyMax, moneyMin, moneyMinus, moneyPlus, moneySum } from './moneyMath.js';

const PLN: Money = [1000, 'PLN'];
const EUR: Money = [1000, 'EUR'];

// Every two-operand function here guards on currency by calling `assertCurrenciesMatch` for its
// throw alone. That made the assert's `@__NO_SIDE_EFFECTS__` annotation a licence for a bundler to
// delete the guard — the annotation is gone, and these pin the behaviour it was protecting.
it('rejects mismatched currencies in every two-operand operation', () => {
    expect(() => moneyPlus(PLN, EUR)).toThrow('Currencies do not match');
    expect(() => moneyMinus(PLN, EUR)).toThrow('Currencies do not match');
    expect(() => moneyMax(PLN, EUR)).toThrow('Currencies do not match');
    expect(() => moneyMin(PLN, EUR)).toThrow('Currencies do not match');
    expect(() => moneySum([PLN, EUR])).toThrow('Currencies do not match');
});

it('names both currencies, so the failure says which values disagreed', () => {
    expect(() => assertCurrenciesMatch(PLN, EUR)).toThrow('Currencies do not match: PLN !== EUR');
});

it('accepts matching currencies', () => {
    expect(assertCurrenciesMatch(PLN, PLN)).toBeUndefined();
    expect(moneyPlus(PLN, [500, 'PLN'])).toEqual([1500, 'PLN']);
});
