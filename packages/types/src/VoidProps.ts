/** Picks only properties from T whose value types are not void. */
export type NonVoidProps<T> = {
    [K in keyof T as T[K] extends void ? never : K]: T[K];
};

/** Extracts the keys of T whose value types are void. */
export type NonVoidPropKeys<T> = keyof NonVoidProps<T>;

/** Extracts the keys of T whose value types are void. */
export type VoidPropKeys<T> = keyof {
    [K in keyof T as T[K] extends void ? K : never]: T[K];
};
