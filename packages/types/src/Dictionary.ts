/**
 *
 */
export type Dictionary<TValue, TKey extends number | string = number | string> = {
    [P in TKey]+?: TValue;
};
