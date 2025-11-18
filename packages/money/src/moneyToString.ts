import { CURRENCIES } from './Currency.js';
import type { Money } from './Money.js';

/**
 *
 */
export function moneyToString(money: Money) {
    const [amount, currency] = money;
    const { fractionDigits } = CURRENCIES[currency];
    const multiplier = 10 ** fractionDigits;
    return `${(amount / multiplier).toFixed(fractionDigits)}`;
}
