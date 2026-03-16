/** Simplifies a mapped type into a flat object type for better readability. */
export type Flatten<T> = Exclude<
    {
        [K in keyof T]: T[K];
    },
    undefined
>;

/** Omits specific keys K from T using key remapping. */
export type OmitProps<T, K extends keyof T> = {
    [P in keyof T as P extends K ? never : P]: T[P];
};

/** Omits properties from T whose value types are assignable to V. */
export type OmitPropTypes<T, V> = {
    [P in keyof T as V extends T[P] ? never : P]: T[P];
};

/** Picks only properties from T whose value types extend V. */
export type PickPropTypes<T, V> = {
    [P in keyof T as T[P] extends V ? P : never]: T[P];
};

/** Picks only keys K from T while explicitly marking all other keys as never-optional. */
export type PickProps<T, K extends keyof T> = {
    [P in keyof T as P extends K ? never : P]?: never;
} & {
    [P in keyof T as P extends K ? P : never]: T[P];
};

/** Represents any non-primitive value - use when you need to accept any object shape. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SomeObject = {};

/** Maps all properties of T to optional never, useful for creating exclusive union discriminants. */
export type PartialNever<T> = {
    [P in keyof T]?: never;
};

/** Makes all properties of T optional and additionally allows null values. */
export type PartialNullable<T> = {
    [P in keyof T]?: T[P] | null;
};

/**
 * Turns selected properties of an object to optional.
 */
export type PartialProps<T, K extends keyof T> = Flatten<
    {
        [P in keyof T as P extends K ? never : P]: T[P];
    } & {
        [P in keyof T as P extends K ? P : never]?: T[P];
    }
>;
