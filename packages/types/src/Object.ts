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
