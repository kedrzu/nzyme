/**
 * Pluralization function
 */
export interface Pluralization<TPlural extends string = string> {
    /**
     * Plural types
     */
    plurals: TPlural[];
    /**
     * Optional plural types
     */
    optionalPlurals?: TPlural[];
    /**
     * @param count {number} a choice index given by the input to $tc.
     * @param optionsCount {number} an overall amount of available choices
     * @returns a final choice index to select plural word by
     */
    pluralize<T>(count: number, plurals: Partial<Record<TPlural, T>>): T | undefined;
}

/**
 * Plural translation
 */
export type PluralTranslation<TPluralization extends Pluralization, TParams extends object> = {
    [plural in TPluralization['plurals'][number]]?: (params: TParams) => string | unknown[];
};

/**
 * English pluralization
 */
export const englishPluralization = definePluralization({
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
export const polishPluralization = definePluralization({
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

        if (count < 10 || count > 20) {
            // np: 3 jabłka lub 23 jabłka
            const lastDigit = count % 10;
            if (lastDigit >= 2 && lastDigit <= 4) {
                return plurals.few ?? plurals.many;
            }
        }

        // np 8 jabłek
        return plurals.many ?? plurals.few;
    },
});

/**
 * Czech pluralization
 */
export const czechPluralization = polishPluralization;

/**
 * Define a pluralization method
 * @param pluralization - Pluralization
 * @returns Pluralization
 * @__NO_SIDE_EFFECTS__
 */
export function definePluralization<TPlural extends string>(pluralization: Pluralization<TPlural>) {
    return pluralization;
}
