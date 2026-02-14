/**
 *
 */
export type LiteralPick<T extends string, I extends T> = I;
/**
 *
 */
export type LiteralExclude<T extends string, I extends T> = Exclude<T, I>;
