import type { MultiValueDictionary } from './types.js';

/**
 * Gets the first value carried under a name, whether or not the name was repeated.
 */
export function getSingleValue<T>(dictionary: MultiValueDictionary<T> | undefined, key: string): T | undefined {
    const value = dictionary?.[key];
    if (!value) {
        return undefined;
    }

    return value.multiValue?.[0] ?? value;
}
