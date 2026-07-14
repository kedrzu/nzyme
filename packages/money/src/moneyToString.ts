import { CURRENCIES } from './Currency.js';
import type { Money } from './Money.js';

/**
 * Converts a Money tuple to its formatted decimal string representation.
 * @util
 */
export function moneyToString(money: Money) {
    const [amount, currency] = money;
    const { fractionDigits } = CURRENCIES[currency];
    const multiplier = 10 ** fractionDigits;
    return `${(amount / multiplier).toFixed(fractionDigits)}`;
}
