/**
 *
 */
export type Flatten<T> = Exclude<
    {
        [K in keyof T]: T[K];
    },
    undefined
>;

/**
 *
 */
export type OmitProps<T, K extends keyof T> = {
    [P in keyof T as P extends K ? never : P]: T[P];
};

/**
 *
 */
export type OmitPropTypes<T, V> = {
    [P in keyof T as V extends T[P] ? never : P]: T[P];
};

/**
 *
 */
export type PickPropTypes<T, V> = {
    [P in keyof T as T[P] extends V ? P : never]: T[P];
};

/**
 *
 */
export type PickProps<T, K extends keyof T> = {
    [P in keyof T as P extends K ? never : P]?: never;
} & {
    [P in keyof T as P extends K ? P : never]: T[P];
};

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SomeObject = {};

/**
 *
 */
export type PartialNever<T> = {
    [P in keyof T]?: never;
};

/**
 *
 */
export type PartialNullable<T> = {
    [P in keyof T]?: T[P] | null;
};
