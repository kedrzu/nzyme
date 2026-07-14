import { CURRENCIES } from './Currency.js';
import type { Currency } from './Currency.js';

/**
 * Converts a decimal amount to its integer representation in the currency's smallest unit.
 * @util
 */
export function moneyNormalize(value: number | null, currency: Currency) {
    if (value == null) {
        return null;
    }

    return Math.round(value * 10 ** CURRENCIES[currency].fractionDigits);
}
