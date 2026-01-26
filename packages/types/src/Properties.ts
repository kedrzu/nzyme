export type IfPropertyOptional<T, K extends keyof T, Y, N> = T extends { [KK in K]-?: T[K] } ? N : Y;

export type IsPropertyOptional<T, K extends keyof T> = IfPropertyOptional<T, K, true, false>;

export type OptionalProperties<T> = {
    [K in keyof T as IfPropertyOptional<T, K, K, never>]: T[K];
};

export type RequiredProperties<T> = {
    [K in keyof T as IfPropertyOptional<T, K, never, K>]: T[K];
};

export type DefinedProperties<T> = {
    [K in keyof T as T[K] | undefined extends T[K] ? never : K]: T[K];
};
