import { definePluralization } from './pluralization.js';

/**
 * English pluralization
 */
export const pluralizationEn = definePluralization({
    plurals: ['many', 'one', 'zero'],
    optionalPlurals: ['zero'],
    pluralize: (count, plurals) => {
        switch (count) {
            case 0:
                return plurals.zero ?? plurals.many;
            case 1:
                return plurals.one;
            default:
                return plurals.many;
        }
    },
});

/**
 * Polish pluralization
 */
export const pluralizationPl = definePluralization({
    plurals: ['few', 'many', 'one', 'zero'],
    optionalPlurals: ['zero'],
    pluralize: (count, plurals) => {
        // np: zero jabłek
        if (count === 0) {
            return plurals.zero ?? plurals.many ?? plurals.few;
        }

        // np: jedno jabłko
        if (count === 1) {
            return plurals.one;
        }

        // np: 3 jabłka lub 23 jabłka, ale 12 jabłek i 112 jabłek
        const lastDigit = count % 10;
        const lastTwoDigits = count % 100;
        if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
            return plurals.few ?? plurals.many;
        }

        // np 8 jabłek
        return plurals.many ?? plurals.few;
    },
});

/**
 * Czech pluralization
 */
export const pluralizationCs = pluralizationPl;

/**
 * German pluralization
 */
export const pluralizationDe = pluralizationEn;
