/**
 *
 */
export type NonVoidProps<T> = {
    [K in keyof T as T[K] extends never | void ? never : K]: T[K];
};

/**
 *
 */
export type NonVoidPropKeys<T> = keyof NonVoidProps<T>;

/**
 *
 */
export type VoidPropKeys<T> = keyof {
    [K in keyof T as T[K] extends never | void ? K : never]: T[K];
};
