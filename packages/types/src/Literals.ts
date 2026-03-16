/** Picks specific literal members I from a string union T, enforcing that I is a subset of T. */
export type LiteralPick<T extends string, I extends T> = I;

/** Excludes specific literal members I from a string union T, enforcing that I is a subset of T. */
export type LiteralExclude<T extends string, I extends T> = Exclude<T, I>;
