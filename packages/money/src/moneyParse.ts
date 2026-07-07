import type { Currency } from './Currency.js';
import { CURRENCIES } from './Currency.js';
import { moneyNormalize } from './moneyNormalize.js';

/**
 * Parses a string amount into its integer representation in the currency's smallest unit.
 * @util
 */
export function moneyParse(value: string, currency: Currency) {
    const { fractionSymbol } = CURRENCIES[currency];

    if (fractionSymbol !== '.') {
        value = value.replace(fractionSymbol, '.');
    }

    value = value.replace(/\s*/g, '');

    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        return null;
    }

    return moneyNormalize(parsed, currency);
}
