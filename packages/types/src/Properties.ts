/** Checks whether property K of T is optional, returning Y if true, N otherwise. */
export type IfPropertyOptional<T, K extends keyof T, Y, N> = T extends { [KK in K]-?: T[K] } ? N : Y;

/** Resolves to true if property K of T is optional, false otherwise. */
export type IsPropertyOptional<T, K extends keyof T> = IfPropertyOptional<T, K, true, false>;

/** Extracts only the optional properties from T. */
export type OptionalProperties<T> = {
    [K in keyof T as IfPropertyOptional<T, K, K, never>]: T[K];
};

/** Extracts only the required properties from T. */
export type RequiredProperties<T> = {
    [K in keyof T as IfPropertyOptional<T, K, never, K>]: T[K];
};

/** Extracts properties from T whose types do not include undefined. */
export type DefinedProperties<T> = {
    [K in keyof T as T[K] | undefined extends T[K] ? never : K]: T[K];
};
