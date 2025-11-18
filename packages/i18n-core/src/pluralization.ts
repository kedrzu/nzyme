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
 * Define a pluralization method
 * @param pluralization - Pluralization
 * @returns Pluralization
 * @__NO_SIDE_EFFECTS__
 */
export function definePluralization<TPlural extends string>(pluralization: Pluralization<TPlural>) {
    return pluralization;
}
