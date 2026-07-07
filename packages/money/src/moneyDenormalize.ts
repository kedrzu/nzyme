import { CURRENCIES } from './Currency.js';
import type { Currency } from './Currency.js';

/**
 * Denormalize money
 * @util
 */
export function moneyDenormalize(value: number | null, currency: Currency) {
    if (value == null) {
        return null;
    }

    return value / 10 ** CURRENCIES[currency].fractionDigits;
}
