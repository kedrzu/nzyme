/** A record with optional values, indexed by string or number keys. */
export type Dictionary<TValue, TKey extends number | string = number | string> = {
    [P in TKey]+?: TValue;
};
