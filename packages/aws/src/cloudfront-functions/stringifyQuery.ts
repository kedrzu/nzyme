import type { CloudFrontQuery } from './types.js';

/**
 * Rebuilds a query string from the object CloudFront parsed it into.
 *
 * Values are **not** re-encoded. CloudFront hands the function the query string as it arrived, still
 * percent-encoded, so encoding it again turns `?a=b%20c` into `?a=b%2520c` and the target receives
 * `b%20c` where the viewer sent `b c`.
 *
 * Parameter order is CloudFront's, not the viewer's — the original ordering is gone by the time the
 * function runs, because the runtime passes an object rather than the raw string.
 */
export function stringifyQuery(query: CloudFrontQuery) {
    let qs = '';

    for (const key of Object.keys(query)) {
        const value = query[key];
        if (!value) {
            continue;
        }

        // The first value is repeated in both properties, so reading each would emit it twice.
        if (value.multiValue) {
            for (let i = 0; i < value.multiValue.length; i++) {
                qs = appendQueryString(qs, key, value.multiValue[i]!.value);
            }
        } else {
            qs = appendQueryString(qs, key, value.value);
        }
    }

    if (qs) {
        qs = '?' + qs;
    }

    return qs;
}

/**
 * Appends one already-encoded name/value pair to a query string.
 */
export function appendQueryString(qs: string, key: string, value: string | null) {
    if (value == null) {
        return qs;
    }

    if (qs.length) {
        qs += '&';
    }

    qs += `${key}=${value}`;

    return qs;
}
