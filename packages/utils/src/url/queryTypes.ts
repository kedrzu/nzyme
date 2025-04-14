/**
 * A single query parameter value, which can be a string or null
 */
type QueryParamValue = string | null;

/**
 * A query parameter that can be either a single value or an array of values
 */
export type QueryParam = QueryParamValue | QueryParamValue[];

/**
 * An object representing URL query parameters where each key can have either
 * a single value, an array of values, or be undefined
 */
export type QueryParams = Record<string, QueryParam | undefined>;

/**
 * An object representing URL query parameters where each key can have only
 * a single value (string, null, or undefined)
 */
export type QueryParamsSimple = Record<string, string | undefined | null>;
