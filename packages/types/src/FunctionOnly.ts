/** Extracts the pure function signature from T, stripping any additional properties. */
export type FunctionOnly<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never;
