import type { QueryParams } from './queryTypes.js';

/**
 * Converts a query parameters object into a URL query string.
 *
 * @param params - The query parameters to convert
 * @returns A URL query string (with leading '?' if not empty)
 */
export function stringifyQuery(params: QueryParams) {
    let qs = '';

    for (const key of Object.keys(params)) {
        const value = params[key];
        if (Array.isArray(value)) {
            for (const val of value) {
                qs = appendQueryString(qs, key, val);
            }
        } else {
            qs = appendQueryString(qs, key, value);
        }
    }

    if (qs) {
        qs = '?' + qs;
    }

    return qs;
}

/**
 * Appends a key-value pair to a query string, handling URL encoding.
 *
 * @param qs - The current query string
 * @param key - The parameter key
 * @param value - The parameter value
 * @returns The updated query string
 */
function appendQueryString(qs: string, key: string, value: string | null | undefined) {
    if (value == null) {
        return qs;
    }

    if (qs.length) {
        qs += '&';
    }

    qs += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

    return qs;
}
