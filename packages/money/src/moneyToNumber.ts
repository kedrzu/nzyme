import { CURRENCIES } from './Currency.js';
import type { Money } from './Money.js';

/**
 * Converts a Money tuple to its decimal number representation.
 * @util
 */
export function moneyToNumber(money: Money) {
    const [amount, currency] = money;
    const { fractionDigits } = CURRENCIES[currency];
    const multiplier = 10 ** fractionDigits;
    return amount / multiplier;
}
