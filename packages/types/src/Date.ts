declare global {
    // In TS, interfaces are "open" and can be extended
    interface Date {
        /**
         * Give a more precise return type to the method `toISOString()`:
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
         */
        toISOString(): DateTimeISO;
    }
}

/**
 * Represent a string like `2021-01-08`
 */
export type DateISO = `${number}-${number}-${number}`;

/**
 * Represent a string like `14:42:34.678`
 */
export type TimeISO = `${number}:${number}:${number}.${number}` | `${number}:${number}:${number}`;

/**
 * Represent a string like `2021-01-08T14:42:34.678Z` (format: ISO 8601).
 */
export type DateTimeISO =
    | `${DateISO}T${TimeISO}+${number}:${number}`
    | `${DateISO}T${TimeISO}`
    | `${DateISO}T${TimeISO}Z`;

/**
 * Represent a date input.
 */
export type DateInput = number | Date | DateISO | DateTimeISO;
