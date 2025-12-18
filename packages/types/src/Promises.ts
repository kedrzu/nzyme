/**
 * A promise or a value.
 * Useful when you need to return a promise or a value from a function.
 */
export type PromiseMaybe<T> = Promise<T> | T;
