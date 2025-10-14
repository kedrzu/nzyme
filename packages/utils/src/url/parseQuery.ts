import type { QueryParams, QueryParamsSimple } from './queryTypes.js';

/**
 * Parses a URL query string into an object.
 *
 * @param querystring - The query string to parse (with or without leading '?')
 * @param options - Configuration options for parsing
 * @param options.multiple - Whether to allow multiple values for the same key
 * @returns An object containing the parsed query parameters
 */
export function parseQuery(querystring: null | string | undefined): QueryParamsSimple;
export function parseQuery(
    querystring: null | string | undefined,
    options: { multiple: false },
): QueryParamsSimple;
export function parseQuery(
    querystring: null | string | undefined,
    options: { multiple: true },
): QueryParams;
export function parseQuery(
    querystring: null | string | undefined,
    options?: { multiple: boolean },
): QueryParams {
    const query: QueryParams = {};
    const multiple = options?.multiple || false;

    if (!querystring) {
        return query;
    }

    if (querystring.startsWith('?')) {
        querystring = querystring.slice(1);
    }

    for (const item of querystring.split('&')) {
        const [rawKey, rawValue] = item.split('=');
        if (!rawKey) {
            continue;
        }

        const key = decodeURIComponent(rawKey);
        const value = decodeURIComponent(rawValue ?? '');

        // Sometimes a query string can have multiple values
        // for the same key, so to factor that case in, you
        // could collect an array of values for the same key
        let entry = query[key];

        if (entry === undefined) {
            query[key] = value;
            continue;
        }

        if (!multiple) {
            // Allows only for a single value per key
            continue;
        }

        // If the value for this key was not previously an array, update it
        if (!Array.isArray(entry)) {
            query[key] = entry = [entry];
        }

        entry.push(value);
    }

    return query;
}
