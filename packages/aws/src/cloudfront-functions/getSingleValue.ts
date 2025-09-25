import type { MultiValueDictionary } from './types.js';

/**
 * Gets the single value from a multivalue.
 */
export function getSingleValue<T>(dictionary: MultiValueDictionary<T> | undefined, key: string): T | undefined {
    const value = dictionary?.[key];
    if (!value) {
        return undefined;
    }

    return value.multivalue?.[0] ?? value;
}
