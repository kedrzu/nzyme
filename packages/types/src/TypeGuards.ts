/**
 * If the type is any.
 */
export type IfAny<T, Y, N = T> = 0 extends 1 & T ? Y : N;

/**
 * If the type is a literal.
 */
export type IfLiteral<T, Y, N = T> = T | 'jy@##O8sjzv=(+mby#4T=3gLHwU+0Z' extends T ? N : Y;

/**
 * If the type is nullable.
 */
export type IfNullable<T, Y, N = T> = IfAny<T, T, T | null extends T ? Y : N>;

/**
 * If the type is undefined.
 */
export type IfUndefined<T, Y, N = T> = IfAny<T, T, T | undefined extends T ? Y : N>;

/**
 * If the type is unknown.
 */
export type IfUnknown<T, Y, N = T> = IfAny<T, T, unknown extends T ? Y : N>;

/**
 * If the type is never.
 */
export type IfNever<T, Y, N = T> = [T] extends [never] ? Y : N;
